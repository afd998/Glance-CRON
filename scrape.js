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



async function saveToSupabase(processedEvents) {
    try {
        console.log(`Saving ${processedEvents.length} events to Supabase...`);
        
        const { data: result, error } = await supabase
            .from('events')
            .upsert(processedEvents, {
                onConflict: 'id',
                ignoreDuplicates: false
            });
        
        if (error) {
            console.error('Supabase error details:', error);
            throw error;
        }
        console.log(`Successfully saved ${processedEvents.length} events to Supabase`);
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
          const response = await fetch(`https://25live.collegenet.com/25live/data/northwestern/run/availability/availabilitydata.json?obj_cache_accl=0&start_dt=${startDate}&comptype=availability_home&compsubject=location&page_size=100&space_favorite=T&include=closed+blackouts+pending+related+empty&caller=pro-AvailService.getData`, {
              headers: {
                  'Cookie': cookieString,
                  'Accept': 'application/json',
                  'Content-Type': 'application/json',
                  'X-Requested-With': 'XMLHttpRequest'
              }
          });
          
          const rawData = await response.json();
          console.log('API Response status:', response.status);
          console.log('API Response headers:', JSON.stringify(Object.fromEntries(response.headers.entries()), null, 2));
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
          if (!rawData || !rawData.subjects) {
              console.error('Invalid data received. Full response:', JSON.stringify(rawData, null, 2));
              throw new Error('Invalid data received from API: ' + JSON.stringify(rawData));
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
          
          // Make all API requests in parallel using fetch
          const detailPromises = processedData.map(async (item) => {
              try {
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
                  console.log('Event with details:', JSON.stringify(eventWithDetails, null, 2));
                  return eventWithDetails;
              } catch (error) {
                  console.error(`Error processing item ${item.itemId}:`, error.message);
                  const eventWithDetails = {
                      ...item,
                      itemDetails: null,
                      error: error.message
                  };
                  console.log('Event with details (error case):', JSON.stringify(eventWithDetails, null, 2));
                  return eventWithDetails;
              }
          });

          // Wait for all requests to complete
          const finalData = await Promise.all(detailPromises);
          
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
        await saveToSupabase(processedData);
        
        // Also save locally as backup
        const outputPath = `output-${date}.json`;
        fs.writeFileSync(outputPath, JSON.stringify(processedData, null, 2));
        console.log(`Data saved to ${outputPath}`);

    } catch (error) {
        console.error('Error in main process:', error);
        process.exit(1);
    } finally {
        if (browser) {
            await browser.close();
        }
    }
})();
