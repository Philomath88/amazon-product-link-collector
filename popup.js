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
});