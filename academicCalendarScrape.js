// academicCalendarScrape.js
const https = require('https');
const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');
const config = require('./config');

// Initialize Supabase client
const supabase = createClient(config.supabase.url, config.supabase.serviceKey);

// Function to decode HTML entities
function decodeHtmlEntities(text) {
    if (!text) return text;
    
    const htmlEntities = {
        '&amp;': '&',
        '&lt;': '<',
        '&gt;': '>',
        '&quot;': '"',
        '&#39;': "'",
        '&apos;': "'",
        '&nbsp;': ' ',
        '&copy;': '©',
        '&reg;': '®',
        '&trade;': '™',
        '&hellip;': '…',
        '&mdash;': '—',
        '&ndash;': '–',
        '&lsquo;': "'",
        '&rsquo;': "'",
        '&ldquo;': '"',
        '&rdquo;': '"'
    };
    
    let decodedText = text;
    for (const [entity, replacement] of Object.entries(htmlEntities)) {
        decodedText = decodedText.replace(new RegExp(entity, 'g'), replacement);
    }
    
    return decodedText;
}

async function fetchAcademicCalendar() {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'www.kellogg.northwestern.edu',
            path: '/the-experience/academic-calendar/',
            method: 'GET',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
        };

        const req = https.request(options, (res) => {
            console.log(`Status: ${res.statusCode}`);
            console.log(`Headers: ${JSON.stringify(res.headers, null, 2)}`);

            let data = '';
            res.on('data', (chunk) => {
                data += chunk;
            });

            res.on('end', () => {
                console.log('HTML Content Length:', data.length);
                console.log('First 500 characters of HTML:');
                console.log(data.substring(0, 500));
                console.log('\n...\n');
                console.log('Last 500 characters of HTML:');
                console.log(data.substring(data.length - 500));
                
                resolve(data);
            });
        });

        req.on('error', (error) => {
            console.error('Error fetching academic calendar:', error);
            reject(error);
        });

        req.end();
    });
}

async function parseAcademicCalendar(html) {
    console.log('\n=== PARSING ACADEMIC CALENDAR ===');
    console.log('HTML length:', html.length);
    
    const results = [];
    
    // Find all section elements that contain layout-grid
    const sectionRegex = /<section[^>]*class="[^"]*layout-grid[^"]*"[^>]*>(.*?)<\/section>/gs;
    const sectionMatches = html.match(sectionRegex);
    
    if (!sectionMatches) {
        console.log('No layout-grid sections found');
        return { timestamp: new Date().toISOString(), results: [] };
    }
    
    console.log(`Found ${sectionMatches.length} layout-grid sections`);
    
    sectionMatches.forEach((section, sectionIndex) => {
        console.log(`\n--- Processing Section ${sectionIndex + 1} ---`);
        
        // Find the column header in this section
        const headerRegex = /<div[^>]*class="[^"]*layout-grid__column-header[^"]*"[^>]*>.*?<h3[^>]*>(.*?)<\/h3>/gs;
        const headerMatch = section.match(headerRegex);
        
        if (!headerMatch) {
            console.log('No column header found in this section');
            return;
        }
        
        // Extract the header text (remove HTML tags and decode entities)
        const headerText = decodeHtmlEntities(headerMatch[0].replace(/<[^>]*>/g, '').trim());
        console.log(`Header text: "${headerText}"`);
        
        // Check if this section is "Fall Pre-Term" - if so, don't mark any events as start_of_quarter
        const isFallPreTerm = headerText.toLowerCase().includes('fall pre-term');
        console.log(`Is Fall Pre-Term section: ${isFallPreTerm}`);
        
        // Find all cells in this section
        const cellRegex = /<div[^>]*class="[^"]*layout-grid__cell[^"]*"[^>]*>(.*?)<\/div>/gs;
        const cellMatches = section.match(cellRegex);
        
        if (!cellMatches) {
            console.log('No cells found in this section');
            return;
        }
        
        console.log(`Found ${cellMatches.length} cells in this section`);
        
        // Track if we've found the first event in this section
        let firstEventFound = false;
        
        cellMatches.forEach((cell, cellIndex) => {
            // Find strong tags in the cell (both <strong> and <b> tags)
            const strongRegex = /<(strong|b)[^>]*>(.*?)<\/(strong|b)>/gs;
            const strongMatches = cell.match(strongRegex);
            
            if (strongMatches) {
                strongMatches.forEach(strongMatch => {
                    // Extract the strong text (remove HTML tags)
                    const strongText = strongMatch.replace(/<[^>]*>/g, '').trim();
                    
                    if (strongText) {
                        // Take last 4 characters from header and append to strong text
                        const headerSuffix = headerText.slice(-4);
                        const dateString = `${strongText} ${headerSuffix}`;
                        
                        console.log(`  Parsing date: "${strongText}" + "${headerSuffix}" = "${dateString}"`);
                        
                        // Get the label from the next cell
                        let labelText = '';
                        if (cellIndex + 1 < cellMatches.length) {
                            const nextCell = cellMatches[cellIndex + 1];
                            // Extract text content from the next cell (remove HTML tags and decode entities)
                            labelText = decodeHtmlEntities(nextCell.replace(/<[^>]*>/g, '').trim());
                        }
                        
                        // Convert date string to ISO format for Supabase
                        let isoDate = null;
                        try {
                            // Try to parse the date more carefully
                            const dateObj = new Date(dateString);
                            console.log(`  Parsed date object: ${dateObj.toISOString()}`);
                            
                            if (!isNaN(dateObj.getTime())) {
                                // Check if the year seems reasonable (should be current year or next year)
                                const currentYear = new Date().getFullYear();
                                const parsedYear = dateObj.getFullYear();
                                
                                console.log(`  Year check: parsed=${parsedYear}, current=${currentYear}`);
                                
                                // If the parsed year is more than 1 year in the future, it might be wrong
                                if (parsedYear > currentYear + 1) {
                                    console.log(`  Warning: Parsed year ${parsedYear} seems too far in the future`);
                                    // Try to fix by using current year
                                    const fixedDate = new Date(dateString);
                                    fixedDate.setFullYear(currentYear);
                                    console.log(`  Fixed date: ${fixedDate.toISOString()}`);
                                    isoDate = fixedDate.toISOString();
                                } else {
                                    isoDate = dateObj.toISOString();
                                }
                            }
                        } catch (error) {
                            console.log(`Could not parse date: ${dateString}`, error);
                        }
                        
                        // Create a unique hash from date_string and label
                        const hashString = `${dateString}${labelText}`;
                        let hash = 0;
                        for (let i = 0; i < hashString.length; i++) {
                            const char = hashString.charCodeAt(i);
                            hash = ((hash << 5) - hash) + char;
                            hash = hash & hash; // Convert to 32-bit integer
                        }
                        // Convert to positive int8-compatible number
                        const id = Math.abs(hash) % Number.MAX_SAFE_INTEGER;
                        
                        // Set start_of_quarter to true for the first event found in this section
                        // But exclude Fall Pre-Term sections
                        const isFirstEvent = !firstEventFound && !isFallPreTerm;
                        if (!firstEventFound) {
                            firstEventFound = true;
                        }
                        
                        const resultObject = {
                            id: id,
                            date: isoDate,
                            date_string: dateString, // Keep original string for reference
                            label: labelText,
                            start_of_quarter: isFirstEvent
                        };
                        
                        results.push(resultObject);
                        console.log(`Result object: ${JSON.stringify(resultObject, null, 2)}`);
                    }
                });
            }
        });
    });
    
    console.log(`\n=== FINAL RESULTS ===`);
    console.log(`Total combined entries: ${results.length}`);
    
    // Filter out elements with "TBD" or "and" in the date
    const filteredResults = results.filter(result => {
        // Skip entries where date_string is null or undefined
        if (!result.date_string) {
            console.log(`Skipping entry with null date_string: ${JSON.stringify(result, null, 2)}`);
            return false;
        }
        
        const date = result.date_string.toLowerCase();
        return !date.includes('tbd') && !date.includes('and');
    });
    
    console.log(`\n=== FILTERED RESULTS ===`);
    console.log(`Total filtered entries: ${filteredResults.length}`);
    filteredResults.forEach((result, index) => {
        console.log(`${index + 1}. ${JSON.stringify(result, null, 2)}`);
    });
    
    const parsedData = {
        timestamp: new Date().toISOString(),
        htmlLength: html.length,
        results: results,
        resultCount: results.length
    };
    
    return parsedData;
}

async function saveToSupabase(parsedData) {
    try {
        console.log(`Saving ${parsedData.results.length} academic calendar entries to Supabase...`);
        
        if (parsedData.results.length === 0) {
            console.log('No results to save');
            return;
        }
        
        const { data: result, error } = await supabase
            .from('academic_calendar')
            .upsert(parsedData.results, {
                onConflict: 'id',  // Use the unique ID for conflict resolution
                ignoreDuplicates: false
            });
        
        if (error) {
            console.error('Supabase error details:', error);
            throw error;
        }
        
        console.log(`Successfully upserted ${parsedData.results.length} academic calendar entries to Supabase`);
        console.log('Note: Duplicate entries (same ID) were updated rather than creating new rows');
        
    } catch (error) {
        console.error('Error saving to Supabase:', error);
        // Don't throw - just log the error
        console.log('Continuing without saving to database...');
    }
}

async function clearAcademicCalendarData() {
    try {
        console.log('Clearing existing academic calendar data...');
        
        const { error } = await supabase
            .from('academic_calendar')
            .delete()
            .neq('id', 0); // Delete all records
        
        if (error) {
            console.error('Error clearing academic calendar data:', error);
            throw error;
        }
        
        console.log('Successfully cleared academic calendar data');
        
    } catch (error) {
        console.error('Error clearing academic calendar data:', error);
        throw error;
    }
}

async function main() {
    try {
        console.log('Starting academic calendar scrape...');
        
        // Clear existing data first
        await clearAcademicCalendarData();
        
        // Fetch the HTML
        const html = await fetchAcademicCalendar();
        
        // Parse the HTML
        const parsedData = await parseAcademicCalendar(html);
        
        // Save to Supabase (optional - will continue even if this fails)
        await saveToSupabase(parsedData);
        
        console.log('Academic calendar scrape completed successfully!');
        
    } catch (error) {
        console.error('Error in academic calendar scrape:', error);
        process.exit(1);
    }
}

// Run the script
if (require.main === module) {
    main();
}

module.exports = { fetchAcademicCalendar, parseAcademicCalendar }; 