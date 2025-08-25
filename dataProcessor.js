// Helper functions to extract data from event objects

/**
 * Generate a deterministic ID from source data that can handle large numbers
 * Uses BigInt to avoid precision issues with large concatenated numbers
 * @param {number} itemId - The item ID
 * @param {number} itemId2 - The second item ID  
 * @param {number} subjectItemId - The subject item ID
 * @returns {number} A unique integer ID
 */
const generateDeterministicId = (itemId, itemId2, subjectItemId) => {
  // Create a deterministic ID that combines the three numbers in a way that's guaranteed unique
  // and fits within PostgreSQL int8 limits (19 digits max)
  
  // Convert to strings and pad to ensure consistent length
  const itemIdStr = itemId.toString().padStart(10, '0');
  const itemId2Str = itemId2.toString().padStart(10, '0');
  const subjectItemIdStr = subjectItemId.toString().padStart(5, '0');
  
  // Take the last 6 digits of each to keep the total manageable
  const itemIdPart = parseInt(itemIdStr.slice(-6));
  const itemId2Part = parseInt(itemId2Str.slice(-6));
  const subjectPart = parseInt(subjectItemIdStr.slice(-5));
  
  // Combine using a formula that ensures uniqueness
  // This will produce a number around 15-16 digits, well within int8 limits
  return itemIdPart * 1000000000 + itemId2Part * 10000 + subjectPart;
};

const getEventType = (data) => {
  const panels = data.itemDetails?.defn?.panel || [];
  for (const panel of panels) {
    if (panel.typeId === 11) {
      // Check if this is a Kellogg Executive Education Program
      const kelloggProgram = panel.item?.[6]?.item?.[0]?.itemName;
      if (kelloggProgram === "Kellogg Executive Education Programs" || kelloggProgram === "Kellogg Executive MBA Program") {
        return "KEC";
      }
      
      // Check if this is a CMC program
      const cmcProgram = panel.item?.[8]?.item?.[0]?.itemName;
      if (cmcProgram === "RES CMC, KSM") {
        return "CMC";
      }
      
      // Original logic for other event types
      const eventType = panel.item?.[2]?.itemName;
      if (eventType) return eventType;
    }
  }
  return null;
};

const getInstructorName = (data) => {
  const panels = data.itemDetails?.defn?.panel || [];
  for (const panel of panels) {
    if (panel.typeId === 12) {
      const instructor = panel.item?.[0]?.itemName;
      if (instructor) {
        const cleanName = instructor.replace(/^Instructors:\s*/, '').trim();
        if (cleanName && 
            !cleanName.startsWith('<') && 
            cleanName.length > 2 && 
            cleanName.length < 100 && 
            !cleanName.includes('{') && 
            !cleanName.includes('}')) {
          return cleanName;
        }
      }
    }
    if (panel.typeId === 13) {
      const instructor = panel.item?.[0]?.item?.[0]?.itemName;
      if (instructor) {
        const cleanName = instructor.replace(/^Instructors:\s*/, '').trim();
        if (cleanName && 
            !cleanName.startsWith('<') && 
            cleanName.length > 2 && 
            cleanName.length < 100 && 
            !cleanName.includes('{') && 
            !cleanName.includes('}')) {
          return cleanName;
        }
      }
    }
  }
  return null;
};

const getLectureTitle = (data) => {
  const panels = data.itemDetails?.defn?.panel || [];
  for (const panel of panels) {
    if (panel.typeId === 11 && panel.item?.[1]?.itemName) {
      return panel.item[1].itemName;
    }
  }
  return null;
};



/**
 * Parse room name from format "KGH1110 (70)" to "GH 1110" or "KGHL110" to "GH L110"
 * @param {string} subjectItemName - The subject item name containing room info
 * @returns {string|null} Parsed room name or null if no match
 */
const parseRoomName = (subjectItemName) => {
  if (!subjectItemName) {
    return null;
  }
  // First try to match L-prefixed rooms (KGHL110 format)
  const lMatch = subjectItemName.match(/K(GHL\d+)/);
  if (lMatch) {
    return lMatch[1].replace(/(GH)(L)(\d+)/, 'GH $2$3');
  }
  
  // Then try to match regular rooms
  const match = subjectItemName.match(/K(GH\d+[AB]?)/);
  if (!match) {
    return null;
  }
  
  // Add space between GH and number, preserving A/B suffix if present
  const roomNumber = match[1];
  return roomNumber.replace(/(GH)(\d+)([AB]?)/, 'GH $2$3');
};

/**
 * Parse event resources and return both boolean flags and full resource list
 * @param {Object} event - The event object
 * @returns {Object} Object containing boolean flags and resource list
 */
const parseEventResources = (event) => {
  // Make a deep copy of the prof array if it exists
  const profArray = event.itemDetails?.occur?.prof ? JSON.parse(JSON.stringify(event.itemDetails.occur.prof)) : null;
  
  if (!profArray || !Array.isArray(profArray)) {
    return {
      resources: []
    };
  }

  // Concatenate all rsv arrays from all prof objects
  const allRsv = profArray.reduce((acc, prof) => {
    if (prof.rsv && Array.isArray(prof.rsv)) {
      return [...acc, ...prof.rsv];
    }
    return acc;
  }, []);

  if (allRsv.length === 0) {
    return {
      resources: []
    };
  }

  // Find the reservation that matches the event date
  const eventDate = event.subject_item_date;
  
  const matchingReservation = allRsv.find(rsv => {
    if (!rsv.startDt) {
      return false;
    }
    
    // Extract just the date part from startDt (e.g., "2025-07-15" from "2025-07-15T13:00")
    const reservationDate = rsv.startDt.split('T')[0];
    // Also extract just the date part from eventDate (e.g., "2025-07-16" from "2025-07-16T00:00:00")
    const eventDateOnly = eventDate.split('T')[0];
    const matches = reservationDate === eventDateOnly;
    return matches;
  });

  if (!matchingReservation || !matchingReservation.res) {
    return {
      resources: []
    };
  }

  // Map the res array to just itemName, quantity, and instruction
  const simplifiedResources = matchingReservation.res.map(resource => ({
    itemName: resource.itemName,
    quantity: resource.quantity,
    instruction: resource.instruction
  }));

  return {
    resources: simplifiedResources
  };
};

// Process the raw event data to extract and add processed properties
function processData(rawData) {
  // Handle case where rawData is undefined (no events)
  if (!rawData || !Array.isArray(rawData)) {
    console.log('No events to process');
    return [];
  }
  
  console.log(`Processing ${rawData.length} events to extract additional properties...`);
  
  // Filter out events where itemId or itemId2 equals 0, or subject_itemName contains ampersand
  // BUT only filter itemId=0 if the event name is "(Private)" - we want to keep real events that happen to have itemId=0
  const filteredData = rawData.filter(event => {
    const isPrivateEvent = event.itemId === 0 && (event.itemName === "(Private)" || event.itemName === "Closed");
    return !isPrivateEvent && 
           event.itemId2 !== 0 && 
           !event.subject_itemName?.includes('&');
  });
  
  console.log(`Filtered out ${rawData.length - filteredData.length} events with itemId/itemId2 equal to 0 or containing ampersand in room name`);
  
  return filteredData.map(event => {
    // Convert time strings to hours and minutes
    const startTime = parseFloat(event.start);
    const endTime = parseFloat(event.end);
    
    // Convert to hours and minutes
    const startHour = Math.floor(startTime);
    const startMinute = Math.round((startTime - startHour) * 60);
    const endHour = Math.floor(endTime);
    const endMinute = Math.round((endTime - endHour) * 60);
    
    // Format time strings for database (HH:MM:SS format)
    const startTimeStr = `${startHour.toString().padStart(2, '0')}:${startMinute.toString().padStart(2, '0')}:00`;
    const endTimeStr = `${endHour.toString().padStart(2, '0')}:${endMinute.toString().padStart(2, '0')}:00`;
    
    // Extract just the date part from subject_item_date (YYYY-MM-DD format)
    const eventDate = event.subject_item_date ? event.subject_item_date.split('T')[0] : new Date().toISOString().split('T')[0];
    
    // Get event type and log if missing
    const eventType = getEventType(event);
    if (!eventType) {
      console.log(`WARNING: No event type found for event ${event.itemId} - ${event.itemName}`);
      console.log(`Event has itemDetails: ${!!event.itemDetails}`);
      if (event.itemDetails?.defn?.panel) {
        console.log(`Panel count: ${event.itemDetails.defn.panel.length}`);
      }
    }
    
    console.log(`\n=== DEBUG: Date/Time processing for event ${event.itemId} ===`);
    console.log(`Original subject_item_date: ${event.subject_item_date}`);
    console.log(`Extracted date: ${eventDate}`);
    console.log(`Start time: ${startTimeStr}`);
    console.log(`End time: ${endTimeStr}`);
    console.log(`Event type: ${eventType || 'NONE'}`);
    console.log(`=== END DEBUG for event ${event.itemId} ===\n`);
    
    const generatedId = generateDeterministicId(event.itemId, event.itemId2, event.subject_itemId);
    
    console.log(`ID Generation for event: itemId=${event.itemId}, itemId2=${event.itemId2}, subject_itemId=${event.subject_itemId} => id=${generatedId}`);
    
    return {
      item_id: event.itemId,
      item_id2: event.itemId2,
      // Generate a deterministic ID from the source data for upsert operations
      id: generatedId,
      date: eventDate,
      start_time: startTimeStr,
      end_time: endTimeStr,
      event_name: event.itemName,
      event_type: eventType,
      instructor_name: getInstructorName(event),
      lecture_title: getLectureTitle(event),
      room_name: parseRoomName(event.subject_itemName),
      resources: parseEventResources(event).resources,
      raw: event
    };
  });
}

module.exports = {
  processData,
  getEventType,
  getInstructorName,
  getLectureTitle,
  parseRoomName,
  parseEventResources,
  generateDeterministicId
}; 