// scrape.js
const { chromium } = require('playwright');
const dayjs = require('dayjs');
const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');
const config = require('./config');
const { processData } = require('./dataProcessor');

// Validate configuration
try {
    config.validate();
    console.log('Configuration validated successfully');
} catch (error) {
    console.error('Configuration error:', error.message);
    process.exit(1);
}

// Initialize Supabase client
const supabase = createClient(config.supabase.url, config.supabase.key);

let browser;

async function initBrowser() {
    if (!browser) {
        browser = await chromium.launch({
            headless: config.browser.headless
        });
    }
    return browser;
}



async function saveToSupabase(processedEvents, scrapeDate) {
    try {
        console.log(`Saving ${processedEvents.length} events to Supabase...`);
        
        // Add updated_at timestamp to each event and validate required fields
        const eventsWithTimestamp = processedEvents.map(event => {
            // Validate required fields
            if (!event.id || !event.item_id || !event.item_id2 || !event.date) {
                console.error('Invalid event detected:', {
                    id: event.id,
                    item_id: event.item_id,
                    item_id2: event.item_id2,
                    date: event.date,
                    event_name: event.event_name
                });
                throw new Error(`Event missing required fields: ${JSON.stringify(event)}`);
            }
            
            return {
                ...event,
                updated_at: new Date().toISOString()
            };
        });
        
        // First, get all existing events for this date to identify which ones are no longer present
        console.log('Fetching existing events for comparison...');
        
        const { data: existingEvents, error: fetchError } = await supabase
            .from('events')
            .select('id, item_id, item_id2')
            .eq('date', scrapeDate);
        
        if (fetchError) {
            console.error('Error fetching existing events:', fetchError);
            throw fetchError;
        }
        
        // Create a set of current event IDs for quick lookup
        const currentEventIds = new Set();
        processedEvents.forEach(event => {
            // Debug: Log the event structure to see what we're working with
            console.log('Processing event:', {
                id: event.id,
                item_id: event.item_id,
                item_id2: event.item_id2,
                subject_itemId: event.raw?.subject_itemId,
                room_name: event.room_name,
                event_name: event.event_name,
                hasId: !!event.id,
                hasItemId: !!event.item_id,
                hasItemId2: !!event.item_id2
            });
            
            // Use the already-generated ID from dataProcessor
            if (event.id) {
                currentEventIds.add(event.id);
            } else {
                console.warn('Skipping event with missing ID:', {
                    id: event.id,
                    item_id: event.item_id,
                    item_id2: event.item_id2
                });
            }
        });
        
        // Debug: Log the comparison data
        console.log(`Existing events count: ${existingEvents.length}`);
        console.log(`Current event IDs count: ${currentEventIds.size}`);
        console.log('Sample existing event IDs:', existingEvents.slice(0, 3).map(e => e.id));
        console.log('Sample current event IDs:', Array.from(currentEventIds).slice(0, 3));
        
        // Find events that exist in database but not in current scrape (deleted events)
        const deletedEventIds = existingEvents
            .filter(existingEvent => !currentEventIds.has(existingEvent.id))
            .map(event => event.id);
        
        console.log(`Found ${deletedEventIds.length} events to delete from database`);
        if (deletedEventIds.length > 0) {
            console.log('Sample deleted event IDs:', deletedEventIds.slice(0, 5));
            console.log(`Deleting ${deletedEventIds.length} events that were removed from 25Live...`);
            
            // Delete the events that no longer exist in 25Live
            const { error: deleteError } = await supabase
                .from('events')
                .delete()
                .in('id', deletedEventIds);
            
            if (deleteError) {
                console.error('Error deleting removed events:', deleteError);
                throw deleteError;
            }
            
            console.log(`Successfully deleted ${deletedEventIds.length} removed events`);
        } else {
            console.log('No events need to be deleted');
        }
        
        // Log what we're about to upsert
        console.log(`Attempting to upsert ${eventsWithTimestamp.length} events...`);
        console.log('Sample event for upsert:', JSON.stringify(eventsWithTimestamp[0], null, 2));
        
        // Then upsert the current events (this will update existing ones and add new ones)
        const { data: result, error, status, statusText } = await supabase
            .from('events')
            .upsert(eventsWithTimestamp, {
                onConflict: 'id',
                ignoreDuplicates: false
            })
            .select(); // Add select to see what was actually inserted/updated
        
        if (error) {
            console.error('Supabase upsert error details:', {
                error,
                status,
                statusText,
                message: error.message,
                details: error.details,
                hint: error.hint,
                code: error.code
            });
            throw error;
        }
        
        console.log(`Successfully upserted ${result ? result.length : 'unknown count'} events to Supabase`);
        if (result && result.length > 0) {
            console.log('Sample upserted event:', JSON.stringify(result[0], null, 2));
        } else {
            console.warn('WARNING: Upsert returned no data - this might indicate the events were not actually saved!');
        }
        
    } catch (error) {
        console.error('Error saving to Supabase:', error);
        throw error;
    }
}



async function fetchData(startDate) {
  try {
      console.log('Starting data fetch...');
      const context = await browser.newContext();
      const page = await context.newPage();
      
      try {
          // Start at 25Live
          console.log('Navigating to 25Live...');
          await page.goto('https://25live.collegenet.com/pro/northwestern#!/home/availability');
          
          // Wait for and click the Sign In button
          console.log('Waiting for sign in button...');
          await page.waitForSelector('.c-nav-signin');
          await page.click('.c-nav-signin');
          
          // Wait for the login form and fill credentials
          console.log('Filling login credentials...');
          await page.waitForSelector('input[id="idToken1"]');
          await page.fill('input[id="idToken1"]', process.env.NORTHWESTERN_USERNAME);
          await page.fill('input[id="idToken2"]', process.env.NORTHWESTERN_PASSWORD);
          
          // Click login and wait for navigation
          console.log('Submitting login form...');
          await page.click('input[id="loginButton_0"]');
          await page.waitForNavigation();
          
          // Wait for the main 25Live page to load
          console.log('Waiting for main page to load...');
          await page.waitForSelector('div[ui-view="availability"]');
          
          // Get cookies for authentication
          console.log('Getting authentication cookies...');
          const cookies = await context.cookies();
          console.log('Number of cookies received:', cookies.length);
          console.log('Cookie names:', cookies.map(c => c.name).join(', '));
          
          const cookieString = cookies.map(cookie => `${cookie.name}=${cookie.value}`).join('; ');
          
          // Fetch the availability data with the provided date
          console.log(`Fetching data for date: ${startDate}`);
          const apiUrl = `https://25live.collegenet.com/25live/data/northwestern/run/availability/availabilitydata.json?obj_cache_accl=0&start_dt=${startDate}T00:00:00&comptype=availability_home&compsubject=location&page_size=100&space_favorite=T&include=closed+blackouts+pending+related+empty&caller=pro-AvailService.getData`;
          console.log(`API URL: ${apiUrl}`);
          
          const response = await fetch(apiUrl, {
              headers: {
                  'Cookie': cookieString,
                  'Accept': 'application/json',
                  'Content-Type': 'application/json',
                  'X-Requested-With': 'XMLHttpRequest'
              }
          });
          
          const rawData = await response.json();
          
          // Log the actual API response for debugging
          console.log('=== RAW API RESPONSE DEBUG ===');
          console.log('API Response status:', response.status);
          console.log('Raw data keys:', Object.keys(rawData));
          console.log('Number of subjects:', rawData.subjects ? rawData.subjects.length : 0);
          if (rawData.subjects && rawData.subjects.length > 0) {
              console.log('First subject sample:', JSON.stringify(rawData.subjects[0], null, 2));
              if (rawData.subjects[0].items && rawData.subjects[0].items.length > 0) {
                  console.log('First item sample:', JSON.stringify(rawData.subjects[0].items[0], null, 2));
              }
          }
          console.log('=== END RAW API RESPONSE DEBUG ===');
          console.log('API Response data structure:', {
              hasSubjects: !!rawData.subjects,
              pageCount: rawData.page_count,
              lastUpdate: rawData.lastupdate,
              compType: rawData.comptype
          });
          
          if (rawData.subjects) {
          
              const firstSubject = rawData.subjects[0];
             
            
          }
        
          // Check if we have valid data
          if (!rawData) {
              console.error('Invalid data received. Full response:', JSON.stringify(rawData, null, 2));
              throw new Error('Invalid data received from API: ' + JSON.stringify(rawData));
          }

          // If no subjects, there are no events for this day - exit gracefully
          if (!rawData.subjects) {
              console.log('No events found for this date - exiting');
              return;
          }
         
          
          // Log each subject's structure
          rawData.subjects.forEach((subject, index) => {
             
              if (subject.items) {
                  console.log('Items length:', subject.items.length);
              }
          });
         
          
          // Process the data
          const processedData = rawData.subjects
              .filter(subject => subject.items && Array.isArray(subject.items)) // Only keep subjects with items array
              .reduce((acc, subject) => {
                  const subjectData = Object.entries(subject).reduce((obj, [key, value]) => {
                      if (key !== 'items') {
                          obj[`subject_${key}`] = value;
                      }
                      return obj;
                  }, {});
                  
                  const itemsWithSubject = subject.items.map(item => ({
                      ...item,
                      ...subjectData
                  }));
                  return [...acc, ...itemsWithSubject];
              }, []);
          console.log(`Processing ${processedData.length} items...`);
          
          // Log some sample data to understand structure
          if (processedData.length > 0) {
              console.log('Sample event structure:', {
                  itemId: processedData[0].itemId,
                  itemName: processedData[0].itemName,
                  subject_itemName: processedData[0].subject_itemName,
                  start: processedData[0].start,
                  end: processedData[0].end
              });
          }

          // Make all API requests in parallel using fetch
          const detailPromises = processedData.map(async (item, index) => {
              try {
                  // Add small delay to prevent overwhelming the server
                  if (index > 0 && index % 5 === 0) {
                      await new Promise(resolve => setTimeout(resolve, 200));
                  }
                  
                  console.log(`Fetching details for item ${item.itemId}...`);
                  const itemDetailsResponse = await fetch(
                      `https://25live.collegenet.com/25live/data/northwestern/run/event/detail/evdetail.json?event_id=${item.itemId}&caller=pro-EvdetailDao.get`,
                      {
                          headers: {
                              'Cookie': cookieString
                          }
                      }
                  );
                  const itemDetails = await itemDetailsResponse.json();
                  const eventWithDetails = {
                      ...item,
                      itemDetails: itemDetails.evdetail
                  };
                  return eventWithDetails;
              } catch (error) {
                  console.error(`Error processing item ${item.itemId}:`, error.message);
                  const eventWithDetails = {
                      ...item,
                      itemDetails: null,
                      error: error.message
                  };
                  return eventWithDetails;
              }
          });

          // Wait for all requests to complete
          const finalData = await Promise.all(detailPromises);
          
          // Log summary of detail fetching
          const eventsWithDetails = finalData.filter(event => event.itemDetails);
          const eventsWithoutDetails = finalData.filter(event => !event.itemDetails);
          
          console.log(`Detail fetching summary:`);
          console.log(`- Total events: ${finalData.length}`);
          console.log(`- Events with details: ${eventsWithDetails.length}`);
          console.log(`- Events without details: ${eventsWithoutDetails.length}`);
          
          if (eventsWithoutDetails.length > 0) {
              console.log('Events missing details:');
              eventsWithoutDetails.forEach(event => {
                  console.log(`  - ${event.itemId}: ${event.itemName}`);
              });
          }
          
          return finalData;
          
      } finally {
          await context.close();
      }
  } catch (error) {
      console.error('Error fetching data:', error);
      // If browser is closed, try to reinitialize it
      if (error.message.includes('Target page, context or browser has been closed')) {
          console.log('Browser was closed, reinitializing...');
          await initBrowser();
          // Retry the fetch
          return fetchData(startDate);
      }
      throw error;
  }
}

(async () => {
    try {
        const offset = parseInt(process.argv[2], 10); // from GitHub matrix
        const date = dayjs().add(offset, 'day').format('YYYY-MM-DD');

        console.log(`Scraping data for ${date}`);

        browser = await initBrowser();
        const data = await fetchData(date);
        
        // Process the data to extract additional properties
        const processedData = processData(data);
        
        // Save to Supabase
        await saveToSupabase(processedData, date);

    } catch (error) {
        console.error('Error in main process:', error);
        process.exit(1);
    } finally {
        if (browser) {
            await browser.close();
        }
    }
})();
