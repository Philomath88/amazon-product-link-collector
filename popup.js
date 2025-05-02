document.addEventListener('DOMContentLoaded', function() {
  // The base URL is now hardcoded
  const baseUrl = 'https://amazon-cleaner.onrender.com';
  
  // Add info message about the hardcoded server
  const serverInfo = document.createElement('p');
  serverInfo.textContent = 'Server: ' + baseUrl;
  serverInfo.style.marginTop = '10px';
  serverInfo.style.fontSize = '12px';
  serverInfo.style.color = '#0066c0';
  
  // Replace server URL input with info message
  const serverUrlInput = document.getElementById('serverUrl');
  const saveBtn = document.getElementById('saveBtn');
  
  if (serverUrlInput && saveBtn) {
    serverUrlInput.style.display = 'none';
    saveBtn.style.display = 'none';
    document.querySelector('p').style.display = 'none'; // Hide "Server URL:" text
    
    // Add server info after the hidden elements
    saveBtn.parentNode.insertBefore(serverInfo, document.getElementById('status'));
  }
  
  // Save the base URL to chrome storage on load
  chrome.storage.local.set({baseUrl: baseUrl}, function() {
    console.log('Base URL saved:', baseUrl);
  });
  
  // Debug mode checkbox
  const debugModeCheckbox = document.getElementById('debugMode');
  const debugInfo = document.getElementById('debugInfo');
  
  if (debugModeCheckbox) {
    // Check if debug mode is already enabled
    chrome.storage.local.get(['debugMode'], function(result) {
      const isDebugMode = result.debugMode === true;
      debugModeCheckbox.checked = isDebugMode;
      
      // Display or hide the debug info text
      if (debugInfo) {
        debugInfo.style.display = isDebugMode ? 'block' : 'none';
      }
    });
    
    // Listen for changes to the debug mode checkbox
    debugModeCheckbox.addEventListener('change', function() {
      const isChecked = debugModeCheckbox.checked;
      
      // Save the debug mode state
      chrome.storage.local.set({debugMode: isChecked}, function() {
        console.log('Debug mode set to:', isChecked);
        
        // Show/hide the debug info text
        if (debugInfo) {
          debugInfo.style.display = isChecked ? 'block' : 'none';
        }
        
        // Send a message to content script to update debug mode
        chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
          if (tabs && tabs[0]) {
            chrome.tabs.sendMessage(tabs[0].id, {
              action: 'updateDebugMode',
              debugMode: isChecked
            });
          }
        });
      });
    });
  }
});