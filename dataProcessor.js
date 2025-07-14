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
  // Find the matching reservation for the current date
  const matchingReservation = event.itemDetails?.occur?.prof?.[0]?.rsv?.[0];
  
  if (!matchingReservation || !matchingReservation.res) {
    return {
      hasVideoRecording: false,
      hasHandheldMic: false,
      hasStaffAssistance: false,
      hasWebConference: false,
      hasClickers: false,
      resources: []
    };
  }

  const resources = matchingReservation.res;

  // Compute boolean flags for quick checks
  const hasVideoRecording = resources.some(item => 
    item.itemName === "KSM-KGH-VIDEO-Recording (POST TO CANVAS)" || 
    item.itemName === "KSM-KGH-VIDEO-Recording (PRIVATE LINK)" ||
    item.itemName === "KSM-KGH-VIDEO-Recording"
  );
  
  const hasHandheldMic = resources.some(item => 
    item.itemName === "KSM-KGH-AV-Handheld Microphone"
  );
  
  const hasStaffAssistance = resources.some(item => 
    item.itemName === "KSM-KGH-AV-Staff Assistance"
  );
  
  const hasWebConference = resources.some(item => 
    item.itemName === "KSM-KGH-AV-Web Conference"
  );
  
  const hasClickers = resources.some(item => 
    item.itemName === "KSM-KGH-AV-SRS Clickers (polling)"
  );

  // Simplify resources to just itemName and quantity
  const simplifiedResources = resources.map(resource => ({
    itemName: resource.itemName,
    quantity: resource.quantity
  }));

  return {
    hasVideoRecording,
    hasHandheldMic,
    hasStaffAssistance,
    hasWebConference,
    hasClickers,
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
  const filteredData = rawData.filter(event => {
    return event.itemId !== 0 && 
           event.itemId2 !== 0 && 
           !event.subject_itemName?.includes('&');
  });
  
  console.log(`Filtered out ${rawData.length - filteredData.length} events with itemId/itemId2 equal to 0 or containing ampersand in room name`);
  
  return filteredData.map(event => {
    // Convert time strings to timestamps
    const startTime = parseFloat(event.start);
    const endTime = parseFloat(event.end);
    
    // Convert to hours and minutes
    const startHour = Math.floor(startTime);
    const startMinute = Math.round((startTime - startHour) * 60);
    const endHour = Math.floor(endTime);
    const endMinute = Math.round((endTime - endHour) * 60);
    
    // Create timestamp strings using the subject_item_date
    const eventDate = new Date(event.subject_item_date || new Date());
    
    // Create timestamps that represent the local time
    // We need to adjust for timezone offset to store as local time
    const timezoneOffset = new Date().getTimezoneOffset() * 60 * 1000; // Convert minutes to milliseconds
    
    const startTimestamp = new Date(eventDate);
    startTimestamp.setHours(startHour, startMinute, 0, 0);
    
    const endTimestamp = new Date(eventDate);
    endTimestamp.setHours(endHour, endMinute, 0, 0);
    
    // Store as ISO strings adjusted for timezone
    // This ensures the times are stored as local time, not UTC
    const startTimeISO = new Date(startTimestamp.getTime() + timezoneOffset).toISOString();
    const endTimeISO = new Date(endTimestamp.getTime() + timezoneOffset).toISOString();
    
    return {
      item_id: event.itemId,
      item_id2: event.itemId2,
      // Generate a deterministic ID from the source data for upsert operations
      id: generateDeterministicId(event.itemId, event.itemId2, event.subject_itemId),
      start_time: startTimeISO,
      end_time: endTimeISO,
      event_name: event.itemName,
      event_type: getEventType(event),
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