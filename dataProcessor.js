// Helper functions to extract data from event objects
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

  return {
    hasVideoRecording,
    hasHandheldMic,
    hasStaffAssistance,
    hasWebConference,
    hasClickers,
    resources
  };
};

// Process the raw event data to extract and add processed properties
function processData(rawData) {
  console.log(`Processing ${rawData.length} events to extract additional properties...`);
  
  return rawData.map(event => {
    // Convert time strings to timestamps
    const startTime = parseFloat(event.start);
    const endTime = parseFloat(event.end);
    
    // Convert to hours and minutes
    const startHour = Math.floor(startTime);
    const startMinute = Math.round((startTime - startHour) * 60);
    const endHour = Math.floor(endTime);
    const endMinute = Math.round((endTime - endHour) * 60);
    
    // Create timestamp strings (assuming events are on the scraped date)
    const eventDate = new Date(event.event_date || new Date());
    const startTimestamp = new Date(eventDate);
    startTimestamp.setHours(startHour, startMinute, 0, 0);
    
    const endTimestamp = new Date(eventDate);
    endTimestamp.setHours(endHour, endMinute, 0, 0);
    
    return {
      item_id: event.itemId,
      item_id2: event.itemId2,
      id: parseInt(`${event.itemId}${event.itemId2}`),
      start_time: startTimestamp.toISOString(),
      end_time: endTimestamp.toISOString(),
      event_type: getEventType(event),
      instructor_name: getInstructorName(event),
      lecture_title: getLectureTitle(event),
      room_name: parseRoomName(event.subject_itemName),
      has_video_recording: parseEventResources(event).hasVideoRecording,
      has_handheld_mic: parseEventResources(event).hasHandheldMic,
      has_staff_assistance: parseEventResources(event).hasStaffAssistance,
      has_web_conference: parseEventResources(event).hasWebConference,
      has_clickers: parseEventResources(event).hasClickers,
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
  parseEventResources
}; 