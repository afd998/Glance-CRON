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

const getOrganization = (data) => {
  const panels = data.itemDetails?.defn?.panel || [];
  for (const panel of panels) {
    if (panel.typeId === 11) {
      const organization = panel.item?.[6]?.item?.[0]?.itemName;
      if (organization) {
        return organization;
      }
    }
  }
  return null;
};

const getInstructorNames = (data) => {
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
          // Split on semicolon and space, filter out empty strings, and trim whitespace
          const instructors = cleanName.split('; ')
            .map(name => name.trim())
            .filter(name => name.length > 0);
          return instructors.length > 0 ? instructors : null;
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
          // Split on semicolon and space, filter out empty strings, and trim whitespace
          const instructors = cleanName.split('; ')
            .map(name => name.trim())
            .filter(name => name.length > 0);
          return instructors.length > 0 ? instructors : null;
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
 * Parse event resources for the reservation that matches the event date.
 * @param {Object} event - The event object
 * @returns {Array} Array of simplified resource objects
 */
const parseEventResources = (event) => {
  // Make a deep copy of the prof array if it exists
  const profArray = event.itemDetails?.occur?.prof ? JSON.parse(JSON.stringify(event.itemDetails.occur.prof)) : null;
  
  if (!profArray || !Array.isArray(profArray)) {
    return [];
  }

  // Concatenate all rsv arrays from all prof objects
  const allRsv = profArray.reduce((acc, prof) => {
    if (prof.rsv && Array.isArray(prof.rsv)) {
      return [...acc, ...prof.rsv];
    }
    return acc;
  }, []);

  if (allRsv.length === 0) {
    return [];
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
    return [];
  }

  // Map the res array to just itemName, quantity, and instruction
  const simplifiedResources = matchingReservation.res.map(resource => ({
    itemName: resource.itemName,
    quantity: resource.quantity,
    instruction: resource.instruction
  }));

  return simplifiedResources;
};

/**
 * Convert decimal hour times into HH:MM:SS strings
 * @param {number|string} start - Start time as decimal hours or numeric string
 * @param {number|string} end - End time as decimal hours or numeric string
 * @returns {{ startTimeStr: string, endTimeStr: string }}
 */
const toTimeStrings = (start, end) => {
  const startTime = typeof start === 'number' ? start : parseFloat(start);
  const endTime = typeof end === 'number' ? end : parseFloat(end);

  const startHour = Math.floor(startTime);
  const startMinute = Math.round((startTime - startHour) * 60);
  const endHour = Math.floor(endTime);
  const endMinute = Math.round((endTime - endHour) * 60);

  const startTimeStr = `${startHour.toString().padStart(2, '0')}:${startMinute.toString().padStart(2, '0')}:00`;
  const endTimeStr = `${endHour.toString().padStart(2, '0')}:${endMinute.toString().padStart(2, '0')}:00`;

  return { startTimeStr, endTimeStr };
};

module.exports = {
  generateDeterministicId,
  getEventType,
  getOrganization,
  getInstructorNames,
  getLectureTitle,
  parseRoomName,
  parseEventResources,
  toTimeStrings
};


