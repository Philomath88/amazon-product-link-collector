// Global debug mode flag
let isDebugMode = false;

// Debug logger that only logs when debug mode is enabled
function debugLog(...args) {
  if (isDebugMode) {
    console.log(...args);
  }
}

// Listen for messages from popup
chrome.runtime.onMessage.addListener(function(message, sender, sendResponse) {
  if (message.action === 'updateDebugMode') {
    isDebugMode = message.debugMode;
    debugLog('Debug mode updated to:', isDebugMode);
  }
});

// Check for debug mode setting on startup
chrome.storage.local.get(['debugMode'], function(result) {
  isDebugMode = result.debugMode === true;
  debugLog('Initial debug mode:', isDebugMode);
});

// Helper function to extract ASIN from an Amazon URL
function extractAsinFromUrl(url) {
  try {
    // Try to get ASIN from URL patterns
    // Pattern 1: /dp/ASIN
    let match = url.match(/\/dp\/([A-Z0-9]{10})/);
    if (match) return match[1];
    
    // Pattern 2: /gp/product/ASIN
    match = url.match(/\/gp\/product\/([A-Z0-9]{10})/);
    if (match) return match[1];
    
    // Pattern 3: /sspa/click?... with dp in the URL parameter
    if (url.includes('/sspa/click')) {
      // Extract the URL parameter
      const urlMatch = url.match(/url=([^&]+)/);
      if (urlMatch) {
        const decodedUrl = decodeURIComponent(urlMatch[1]);
        // Now extract ASIN from the decoded URL
        const asinMatch = decodedUrl.match(/\/dp\/([A-Z0-9]{10})/);
        if (asinMatch) return asinMatch[1];
      }
    }
    
    // Pattern 4: data-asin attribute in URL
    match = url.match(/data-asin=([A-Z0-9]{10})/);
    if (match) return match[1];
    
    return null;
  } catch (e) {
    console.error('Error extracting ASIN:', e);
    return null;
  }
}

// Run the script as soon as it loads
(function() {
  // Check if we're on a search results page
  if (window.location.href.includes('/s?') || window.location.href.includes('/search')) {
    // Initial delay to allow Amazon's JavaScript to run
    setTimeout(() => {
      addButtonsToProducts();
      
      // Monitor for dynamic content changes (Amazon may load results via AJAX)
      const observer = new MutationObserver(function(mutations) {
        for (const mutation of mutations) {
          if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
            // Check if any added nodes contain product elements
            for (const node of mutation.addedNodes) {
              if (node.nodeType === Node.ELEMENT_NODE) {
                if (node.querySelector && 
                   (node.querySelector('div[data-asin]') || 
                    (node.hasAttribute && node.hasAttribute('data-asin')))) {
                  setTimeout(() => addButtonsToProducts(), 300);
                  return; // Only trigger once per batch of mutations
                }
              }
            }
          }
        }
      });
      
      observer.observe(document.body, {
        childList: true,
        subtree: true
      });

      // Also run periodically to catch any missed products
      setInterval(addButtonsToProducts, 3000);
    }, 1500);
  }
})();

function addButtonsToProducts() {
  // Target all product containers with data-asin attribute
  const productElements = document.querySelectorAll('div[data-asin]:not([data-asin=""])');
  
  console.log('Found ' + productElements.length + ' product elements');
  
  productElements.forEach(product => {
    // Get product info
    const asin = product.getAttribute('data-asin');
    if (!asin) return;
    
    // Skip if we've already added a button to this product
    const existingButton = product.querySelector('.product-collector-btn');
    if (existingButton) {
      // If button exists but has no pending request and is in Checking state,
      // it might be from a previous page render that didn't complete
      if (!existingButton.dataset.pendingRequest && 
          existingButton.textContent === 'Checking...') {
        console.log('Found stale button for ASIN: ' + asin + ', refreshing status');
        checkProductStatus(asin, existingButton);
      }
      return;
    }
    
    // Look for the title element (h2 within the product)
    const titleElement = product.querySelector('h2');
    if (!titleElement) return;
    
    console.log('Processing product with ASIN: ' + asin);
    
    // Try different approaches to find a good insertion point
    let insertionPoint = null;
    
    // Try approach 1: Look for price-recipe section
    const priceSection = product.querySelector('div[data-cy="price-recipe"]');
    if (priceSection) {
      insertionPoint = priceSection;
    }
    
    // Try approach 2: Look for add to cart button container
    if (!insertionPoint) {
      const addToCartSection = product.querySelector('.puis-atcb-container, .a-button-stack');
      if (addToCartSection) {
        insertionPoint = addToCartSection;
      }
    }
    
    // Try approach 3: Look for delivery-recipe section
    if (!insertionPoint) {
      const deliverySection = product.querySelector('div[data-cy="delivery-recipe"]');
      if (deliverySection) {
        insertionPoint = deliverySection;
      }
    }
    
    // Try approach 4: Look for product details section
    if (!insertionPoint) {
      const detailsSection = product.querySelector('div[data-cy="product-details-recipe"]');
      if (detailsSection) {
        insertionPoint = detailsSection;
      }
    }
    
    // If all approaches failed, use the closest parent element that has a class
    if (!insertionPoint) {
      let parent = titleElement.parentNode;
      while (parent && !parent.className) {
        parent = parent.parentNode;
      }
      if (parent) {
        insertionPoint = parent;
      } else {
        // Last resort - just use the title's parent
        insertionPoint = titleElement.parentNode;
      }
    }
    
    // No insertion point found, skip this product
    if (!insertionPoint) {
      console.log('No insertion point found for ASIN: ' + asin);
      return;
    }
    
    // Get product URL from title's parent link or any link related to the product
    let productUrl = '';
    const linkElement = titleElement.closest('a');
    if (linkElement && linkElement.href) {
      productUrl = linkElement.href;
    } else {
      // Look for any link that might contain the product URL
      const anyLink = product.querySelector('a[href*="/dp/' + asin + '"]');
      if (anyLink && anyLink.href) {
        productUrl = anyLink.href;
      } else {
        // Last resort: construct a basic Amazon URL
        productUrl = 'https://www.amazon.de/dp/' + asin;
      }
    }
    
    // Clean up the URL - Amazon often uses redirecting/tracking URLs
    // Extract the ASIN and construct a clean direct URL
    const cleanAsin = extractAsinFromUrl(productUrl) || asin;
    const cleanUrl = 'https://www.amazon.de/dp/' + cleanAsin;
    
    // Mark product as being processed to prevent duplicate processing
    product.dataset.processingAsin = cleanAsin;
    
    // Create the button
    const button = document.createElement('button');
    button.className = 'product-collector-btn';
    button.setAttribute('data-asin', cleanAsin);
    button.setAttribute('data-product-id', product.id || Date.now()); // Track association with product
    button.textContent = 'Checking...';  // Initial state while checking
    button.style.cssText = 'background-color: #cccccc; color: black; font-weight: bold; border: none; padding: 8px 12px; margin: 5px 0; border-radius: 3px; cursor: pointer; display: block; width: 100%;';
    
    // Add the button after the insertion point
    insertionPoint.parentNode.insertBefore(button, insertionPoint.nextSibling);
    console.log('Button added for ASIN: ' + cleanAsin);
    
    // Check product status in database
    checkProductStatus(cleanAsin, button);
  });
}

// Function to check product status in database
async function checkProductStatus(asin, buttonElement) {
  // Skip if button no longer exists in DOM
  if (!buttonElement || !document.contains(buttonElement)) {
    debugLog(`Button for ${asin} no longer in DOM, skipping status check`);
    return;
  }
  
  // Store the current request in a map to track in-flight requests
  // Use dataset to track requests on the button element itself
  buttonElement.dataset.pendingRequest = 'true';
  buttonElement.dataset.requestStartTime = Date.now();
  
  chrome.storage.local.get(['baseUrl'], async function(result) {
    const baseUrl = result.baseUrl || 'https://amazon-cleaner.onrender.com';
    const apiUrl = `${baseUrl}/api/product/${asin}`;
    
    debugLog(`[DEBUG ${asin}] Checking product status:`, apiUrl);
    
    try {
      // Add a unique request ID for tracing in logs
      const requestId = Math.random().toString(36).substring(2, 8);
      debugLog(`[DEBUG ${asin}] Starting request ${requestId}`);
      
      const response = await fetch(apiUrl);
      debugLog(`[DEBUG ${asin}] Received response for ${requestId}, status: ${response.status}`);
      
      // Skip if button was removed or replaced during the request
      if (!document.contains(buttonElement)) {
        debugLog(`[DEBUG ${asin}] Button was removed during status request ${requestId}`);
        return;
      }
      
      if (response.status === 404) {
        // Product not found in database
        debugLog(`[DEBUG ${asin}] Product not found in DB (404) for request ${requestId}`);
        setButtonState(buttonElement, 'unreported', null);
        return;
      } else if (!response.ok) {
        throw new Error(`Server response was not OK: ${response.status} for request ${requestId}`);
      }
      
      // Always log the raw response text for debugging problem products
      if (asin === 'B0DFPV89L3' || isDebugMode) {
        const responseClone = response.clone();
        const rawText = await responseClone.text();
        debugLog(`[DEBUG ${asin}] Raw response for request ${requestId}:`, rawText);
      }
      
      const data = await response.json();
      
      // Debug log the complete data for the problematic ASIN
      if (asin === 'B0DFPV89L3' || isDebugMode) {
        debugLog(`[DEBUG ${asin}] Complete response data:`, data);
        debugLog(`[DEBUG ${asin}] Response fields:`, Object.keys(data).join(', '));
        debugLog(`[DEBUG ${asin}] success=`, data.success);
        debugLog(`[DEBUG ${asin}] status=`, data.status);
      } else {
        debugLog(`[DEBUG ${asin}] Product status data for request ${requestId}:`, data);
      }
      
      // Skip if button was removed or replaced during the request
      if (!document.contains(buttonElement)) {
        debugLog(`[DEBUG ${asin}] Button was removed during JSON parsing for request ${requestId}`);
        return;
      }
      
      // If found in database, try to handle different response formats
      if (data) {
        // Log all received fields to debug response format issues
        debugLog(`[DEBUG ${asin}] Response fields for ${requestId}:`, Object.keys(data).join(', '));
        
        if (data.success && data.status) {
          // If the product exists in the database, mark it as reported regardless of status
          // This fixes the issue where status="unknown" was not being handled correctly
          if (data.status === 'removed' || data.removed) {
            // For removed products, check if it's actually live on Amazon
            debugLog(`[DEBUG ${asin}] Found removed product that is actually live: ${asin}`);
            // Since we're on Amazon and can see the product, it's actually still available
            // Automatically reset the removed status without user interaction
            resetRemovedStatus(asin, buttonElement, requestId, data.stage || data.status);
          } else if (data.status === 'staged') {
            // For staged products, show special staging status
            debugLog(`[DEBUG ${asin}] Setting state to 'staged' for request ${requestId}`);
            setButtonState(buttonElement, 'staged', data.reportDate || data.createdAt || null);
          } else if (data.status === 'unknown' && (data.productId || data._id || data.id)) {
            // Product exists in DB with "unknown" status - mark as "to be assessed"
            const dbId = data.productId || data._id || data.id;
            debugLog(`[DEBUG ${asin}] Product exists with ID ${dbId} but unknown status, marking as 'to_assess' for request ${requestId}`);
            setButtonState(buttonElement, 'to_assess', data.reportDate || data.createdAt || null);
          } else if (data.productId || data._id || data.id) {
            // Product exists in DB with any other status
            const dbId = data.productId || data._id || data.id;
            debugLog(`[DEBUG ${asin}] Product exists with ID ${dbId}, marking as reported for request ${requestId}`);
            setButtonState(buttonElement, 'reported', data.reportDate || data.createdAt || null);
          } else if (data.status === 'reported') {
            // Standard format
            debugLog(`[DEBUG ${asin}] Setting state to 'reported' for request ${requestId}`);
            setButtonState(buttonElement, 'reported', data.reportDate);
          } else {
            // If we're unsure, assume it needs reporting
            debugLog(`[DEBUG ${asin}] Product has unknown status '${data.status}', setting to unreported for request ${requestId}`);
            setButtonState(buttonElement, 'unreported', null);
          }
        } else if (data._id || data.id || data.productId) {
          // Product exists but different format - assume reported
          const dbId = data._id || data.id || data.productId;
          debugLog(`[DEBUG ${asin}] Product exists with ID ${dbId}, assuming reported for request ${requestId}`);
          setButtonState(buttonElement, 'reported', data.reportDate || data.createdAt || null);
        } else {
          // Default to unreported if status is unclear
          debugLog(`[DEBUG ${asin}] Unknown response format for request ${requestId}, setting to unreported`);
          debugLog(`[DEBUG ${asin}] Full response:`, JSON.stringify(data));
          setButtonState(buttonElement, 'unreported', null);
        }
      }
    } catch (error) {
      console.error(`[DEBUG ${asin}] Error checking product status:`, error);
      
      // Skip if button was removed during the request
      if (document.contains(buttonElement)) {
        // On error, show default state with option to report
        setButtonState(buttonElement, 'unreported', null);
      }
    } finally {
      // Calculate request duration for debugging
      if (document.contains(buttonElement) && buttonElement.dataset.requestStartTime) {
        const duration = Date.now() - parseInt(buttonElement.dataset.requestStartTime);
        debugLog(`[DEBUG ${asin}] Request completed in ${duration}ms`);
        delete buttonElement.dataset.requestStartTime;
      }
      
      // Clear the pending request flag
      if (document.contains(buttonElement)) {
        delete buttonElement.dataset.pendingRequest;
      }
    }
  });
}

// Function to set button state and show a notification
function setButtonStateWithNotification(button, status, reportDate, notification) {
  // Skip if button no longer exists in DOM
  if (!button || !document.contains(button)) {
    console.log(`Button no longer in DOM, can't set state to ${status}`);
    return;
  }
  
  const asin = button.getAttribute('data-asin');
  
  // First set the button state normally
  setButtonState(button, status, reportDate);
  
  // Then show a notification
  const notificationElement = document.createElement('div');
  notificationElement.className = 'status-notification';
  notificationElement.style.cssText = `
    position: absolute;
    top: -15px;
    left: 50%;
    transform: translateX(-50%);
    background-color: rgba(76, 175, 80, 0.9);
    color: white;
    padding: 3px 8px;
    border-radius: 10px;
    font-size: 11px;
    white-space: nowrap;
    box-shadow: 0 1px 3px rgba(0,0,0,0.2);
    z-index: 10;
    animation: fadeOut 5s forwards;
  `;
  notificationElement.textContent = notification;
  
  // Find the container that holds the button
  const container = button.closest('div');
  if (container) {
    // Make sure container has position relative for absolute positioning
    if (!container.style.position) {
      container.style.position = 'relative';
    }
    container.appendChild(notificationElement);
    
    // Remove the notification after 5 seconds
    setTimeout(() => {
      if (notificationElement.parentNode) {
        notificationElement.parentNode.removeChild(notificationElement);
      }
    }, 5000);
  }
  
  // Add CSS animation to page if not already present
  if (!document.getElementById('status-notification-css')) {
    const style = document.createElement('style');
    style.id = 'status-notification-css';
    style.textContent = `
      @keyframes fadeOut {
        0% { opacity: 1; }
        70% { opacity: 1; }
        100% { opacity: 0; }
      }
    `;
    document.head.appendChild(style);
  }
}

// Function to set button state based on product status
function setButtonState(button, status, reportDate) {
  // Skip if button no longer exists in DOM
  if (!button || !document.contains(button)) {
    console.log(`Button no longer in DOM, can't set state to ${status}`);
    return;
  }
  
  const asin = button.getAttribute('data-asin');
  
  // Remove any existing click event listeners to prevent duplicates
  const newButton = button.cloneNode(true);
  button.parentNode.replaceChild(newButton, button);
  button = newButton;
  
  // Create a container for the button and info icon
  const container = document.createElement('div');
  container.style.cssText = 'display: flex; gap: 5px; align-items: center; margin: 5px 0; position: relative;';
  
  // Move the button into the container
  button.parentNode.insertBefore(container, button);
  container.appendChild(button);
  
  // Create info button for products in database
  if (status !== 'unreported') {
    const infoButton = document.createElement('button');
    infoButton.innerHTML = 'ℹ️';
    infoButton.title = 'View product details';
    infoButton.className = 'product-info-btn';
    infoButton.style.cssText = 'background: transparent; border: none; cursor: pointer; font-size: 16px; padding: 0; width: 24px; height: 24px;';
    infoButton.setAttribute('data-asin', asin);
    
    // Add click handler to show product details
    infoButton.addEventListener('click', function(e) {
      e.preventDefault();
      e.stopPropagation();
      viewProductDetails(asin);
    });
    
    container.appendChild(infoButton);
  }
  
  switch(status) {
    case 'reported':
      button.textContent = 'Reported';
      if (reportDate) {
        const date = new Date(reportDate);
        const formattedDate = date.toLocaleDateString('de-DE');
        button.textContent += ` (${formattedDate})`;
      }
      button.style.backgroundColor = '#2E7D32'; // Green
      button.style.color = 'white';
      
      // Add click event to re-report the product if needed
      button.addEventListener('click', function(e) {
        e.preventDefault();
        e.stopPropagation();
        reportProduct(asin, button);
      });
      break;
      
    case 'staged':
      button.textContent = 'Staged';
      if (reportDate) {
        const date = new Date(reportDate);
        const formattedDate = date.toLocaleDateString('de-DE');
        button.textContent += ` (${formattedDate})`;
      }
      button.style.backgroundColor = '#6A1B9A'; // Purple
      button.style.color = 'white';
      
      // Add click event to re-report the product if needed
      button.addEventListener('click', function(e) {
        e.preventDefault();
        e.stopPropagation();
        reportProduct(asin, button);
      });
      break;
      
    case 'needs_update':
      button.textContent = 'Fix Removed Status';
      button.style.backgroundColor = '#C62828'; // Red
      button.style.color = 'white';
      
      // Add click event to update the product status
      button.addEventListener('click', function(e) {
        e.preventDefault();
        e.stopPropagation();
        notifyProductIsLive(asin, button);
      });
      break;
      
    case 'removed':
      button.textContent = 'Removed';
      button.style.backgroundColor = '#757575'; // Gray
      button.style.color = 'white';
      button.disabled = true;
      break;
    
    case 'to_assess':
      button.textContent = 'In Database (click to re-add)';
      button.style.backgroundColor = '#0277BD'; // Blue
      button.style.color = 'white';
      
      // Enable the button so it can be clicked to re-add
      button.addEventListener('click', function(e) {
        e.preventDefault();
        e.stopPropagation();
        reportProduct(asin, button);
      });
      break;
      
    case 'unreported':
    default:
      button.textContent = 'Report';
      button.style.backgroundColor = '#FF9900'; // Amazon orange
      button.style.color = 'black';
      
      // Add click event to report the product
      button.addEventListener('click', function(e) {
        e.preventDefault();
        e.stopPropagation();
        reportProduct(asin, button);
      });
      break;
  }
  
  // Store the current state in a data attribute for debugging
  button.dataset.status = status;
}

// Function to automatically reset the removed status of a product
async function resetRemovedStatus(asin, button, origRequestId, originalStatus) {
  chrome.storage.local.get(['baseUrl'], async function(result) {
    const baseUrl = result.baseUrl || 'https://amazon-cleaner.onrender.com';
    const apiUrl = `${baseUrl}/api/product/${asin}/reset-removed`;
    
    // Generate a unique request ID for this operation
    const requestId = Math.random().toString(36).substring(2, 8);
    debugLog(`[DEBUG ${asin}] Auto-resetting removed status, original status: ${originalStatus}, request ${requestId}`);
    
    // Set button to processing state
    button.textContent = 'Fixing...';
    button.disabled = true;
    button.style.backgroundColor = '#cccccc';
    
    try {
      const response = await fetch(apiUrl, {
        method: 'GET', // Using GET as specified in the endpoint
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      debugLog(`[DEBUG ${asin}] Reset-removed request ${requestId} completed with status ${response.status}`);
      
      if (!response.ok) {
        throw new Error('Server response was not OK: ' + response.status);
      }
      
      // For debugging, log the raw response
      if (isDebugMode) {
        const responseClone = response.clone();
        const rawText = await responseClone.text();
        debugLog(`[DEBUG ${asin}] Raw reset-removed response for ${requestId}:`, rawText);
      }
      
      const data = await response.json();
      debugLog(`[DEBUG ${asin}] Reset-removed response for ${requestId}:`, data);
      
      if (data.success) {
        // Reset fixed, now restore the original status or fallback to "reported"
        debugLog(`[DEBUG ${asin}] Product automatically reset from removed state`);
        
        // Determine which status to set after reset
        let newStatus;
        
        // Check if original status was useful or use the returned status from the API if available
        if (originalStatus && originalStatus !== 'removed') {
          newStatus = originalStatus;
        } else if (data.status) {
          newStatus = data.status;
        } else {
          newStatus = 'reported';
        }
        
        debugLog(`[DEBUG ${asin}] Setting status to ${newStatus} after reset`);
        
        // Set the button state with notification of reset
        setButtonStateWithNotification(button, newStatus, new Date().toISOString(), 'Removed status reset');
      } else {
        debugLog(`[DEBUG ${asin}] Auto-reset failed, unknown response format:`, data);
        // Fall back to manual button
        setButtonState(button, 'needs_update', null);
      }
    } catch (error) {
      console.error(`[DEBUG ${asin}] Error auto-resetting removed status:`, error);
      // Fall back to manual button
      setButtonState(button, 'needs_update', null);
    }
  });
}

// Function for manual button click to reset removed status
async function notifyProductIsLive(asin, button) {
  chrome.storage.local.get(['baseUrl'], async function(result) {
    const baseUrl = result.baseUrl || 'https://amazon-cleaner.onrender.com';
    const apiUrl = `${baseUrl}/api/product/${asin}/reset-removed`;
    
    // Generate a unique request ID for this operation
    const requestId = Math.random().toString(36).substring(2, 8);
    debugLog(`[DEBUG ${asin}] Manual reset-removed request ${requestId}`);
    
    // Change button appearance to show it's processing
    button.textContent = 'Fixing...';
    button.disabled = true;
    button.style.backgroundColor = '#cccccc';
    
    // Add progress indicator for long-running requests
    let dots = 0;
    const progressInterval = setInterval(() => {
      dots = (dots + 1) % 4;
      button.textContent = 'Fixing' + '.'.repeat(dots);
    }, 500);
    
    const startTime = Date.now();
    
    try {
      const response = await fetch(apiUrl, {
        method: 'GET', // Using GET as specified in the endpoint
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      clearInterval(progressInterval);
      
      const requestDuration = Date.now() - startTime;
      debugLog(`[DEBUG ${asin}] Reset-removed request ${requestId} completed in ${requestDuration}ms with status ${response.status}`);
      
      if (!response.ok) {
        throw new Error('Server response was not OK: ' + response.status);
      }
      
      // For debugging, log the raw response
      if (isDebugMode) {
        const responseClone = response.clone();
        const rawText = await responseClone.text();
        debugLog(`[DEBUG ${asin}] Raw reset-removed response for ${requestId}:`, rawText);
      }
      
      const data = await response.json();
      debugLog(`[DEBUG ${asin}] Reset-removed response for ${requestId}:`, data);
      
      if (data.success) {
        // Reset fixed, now mark as reported
        debugLog(`[DEBUG ${asin}] Product reset from removed state for ${requestId}`);
        setButtonStateWithNotification(button, 'reported', new Date().toISOString(), 'Removed status reset');
      } else {
        debugLog(`[DEBUG ${asin}] Unknown response format for ${requestId}:`, data);
        throw new Error('Unknown response format');
      }
    } catch (error) {
      clearInterval(progressInterval);
      console.error(`[DEBUG ${asin}] Error resetting removed status for ${requestId}:`, error);
      
      // Show error state
      button.textContent = 'Error ✗';
      button.style.backgroundColor = '#C62828'; // Red
      button.style.color = 'white';
      
      // Reset after 3 seconds to allow retry
      setTimeout(() => {
        setButtonState(button, 'needs_update', null);
      }, 3000);
    }
  });
}

// Function to view product details
async function viewProductDetails(asin) {
  chrome.storage.local.get(['baseUrl'], async function(result) {
    const baseUrl = result.baseUrl || 'https://amazon-cleaner.onrender.com';
    const apiUrl = `${baseUrl}/api/product/${asin}/full`;
    
    // Create and show loading modal
    const modal = createModal();
    modal.setContent('Loading product details...');
    modal.show();
    
    try {
      const response = await fetch(apiUrl);
      
      if (!response.ok) {
        throw new Error(`Server returned ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json();
      debugLog('Product details:', data);
      
      // Check if the response has a nested product object
      const productData = data.product || data;
      
      // Enhanced debugging for product details
      debugLog(`[DEBUG ${asin}] Product data structure:`, {
        hasProductProperty: !!data.product,
        responseKeys: Object.keys(data),
        productKeys: productData ? Object.keys(productData) : 'No product data'
      });
      
      // Format the product details
      const content = formatProductDetails(productData);
      
      // In debug mode, add raw data for inspection
      if (isDebugMode) {
        const debugSection = document.createElement('div');
        debugSection.style.cssText = 'margin-top: 20px; padding-top: 10px; border-top: 1px solid #ddd;';
        
        const debugTitle = document.createElement('h3');
        debugTitle.textContent = 'Debug Info';
        debugSection.appendChild(debugTitle);
        
        const debugDesc = document.createElement('p');
        debugDesc.textContent = 'Raw product data for debugging:';
        debugSection.appendChild(debugDesc);
        
        const rawData = document.createElement('pre');
        rawData.style.cssText = 'background-color: #f5f5f5; padding: 10px; border-radius: 4px; overflow: auto; max-height: 300px; font-size: 12px;';
        rawData.textContent = JSON.stringify(data, null, 2);
        debugSection.appendChild(rawData);
        
        // Create a container for the content and debug info
        const container = document.createElement('div');
        container.innerHTML = content;
        container.appendChild(debugSection);
        
        modal.setContent(container);
      } else {
        modal.setContent(content);
      }
    } catch (error) {
      console.error('Error fetching product details:', error);
      modal.setContent(`<div class="error">Error loading product details: ${error.message}</div>`);
    }
  });
}

// Creates a modal dialog
function createModal() {
  // Remove any existing modal
  const existingModal = document.getElementById('product-details-modal');
  if (existingModal) {
    existingModal.remove();
  }
  
  // Create the modal container
  const modal = document.createElement('div');
  modal.id = 'product-details-modal';
  modal.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background-color: rgba(0, 0, 0, 0.7);
    display: none;
    justify-content: center;
    align-items: center;
    z-index: 9999;
  `;
  
  // Create the modal content
  const modalContent = document.createElement('div');
  modalContent.className = 'modal-content';
  modalContent.style.cssText = `
    background-color: white;
    padding: 20px;
    border-radius: 5px;
    max-width: 800px;
    max-height: 80vh;
    overflow-y: auto;
    position: relative;
    color: #333;
    font-family: Arial, sans-serif;
  `;
  
  // Create close button
  const closeButton = document.createElement('button');
  closeButton.textContent = '×';
  closeButton.style.cssText = `
    position: absolute;
    top: 10px;
    right: 10px;
    border: none;
    background: none;
    font-size: 24px;
    cursor: pointer;
    color: #555;
  `;
  closeButton.onclick = () => modal.style.display = 'none';
  
  modalContent.appendChild(closeButton);
  modal.appendChild(modalContent);
  document.body.appendChild(modal);
  
  // Return an object with methods to control the modal
  return {
    show: () => {
      modal.style.display = 'flex';
    },
    hide: () => {
      modal.style.display = 'none';
    },
    setContent: (content) => {
      // If content is a string, wrap it in a div
      if (typeof content === 'string') {
        modalContent.innerHTML = `<div>${content}</div>`;
        modalContent.appendChild(closeButton);
      } else {
        // If content is a DOM element, replace existing content
        modalContent.innerHTML = '';
        modalContent.appendChild(content);
        modalContent.appendChild(closeButton);
      }
    }
  };
}

// Format product details for display
function formatProductDetails(product) {
  // Format dates
  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleString('de-DE');
  };
  
  // Format reasons with proper bullets
  const formatReasons = (reasons) => {
    if (!reasons || !reasons.length) return '<p>None specified</p>';
    return '<ul>' + reasons.map(reason => `<li>${reason}</li>`).join('') + '</ul>';
  };
  
  // Format main image
  const getMainImage = (images) => {
    if (!images || !images.length) return '';
    
    // Find the main variant image with reasonable dimensions
    const mainImages = images.filter(img => 
      img.variant === 'MAIN' && img.width >= 300 && img.height >= 300
    );
    
    if (mainImages.length > 0) {
      // Sort by size and get the largest reasonable one
      const sortedImages = mainImages.sort((a, b) => (b.width * b.height) - (a.width * a.height));
      const bestImage = sortedImages[0];
      return `<img src="${bestImage.link}" alt="${product.name || 'Product'}" style="max-width:300px; max-height:300px; margin-bottom:10px;">`;
    }
    
    return '';
  };
  
  // Format the HTML for the modal
  let html = `
    <div style="display:flex; flex-direction:column;">
      <h2 style="margin-top:0;">${product.name || 'Product Details'}</h2>
      
      <div>${getMainImage(product.images)}</div>
      
      <div style="margin-bottom:15px;">
        <strong>ASIN:</strong> ${product.asin || 'N/A'}
      </div>
      
      <div style="margin-bottom:15px;">
        <strong>Brand:</strong> ${product.brand || 'N/A'}
      </div>`;
      
  if (product.stage) {
    html += `
      <div style="margin-bottom:15px;">
        <strong>Stage:</strong> ${product.stage}
      </div>`;
  }
  
  if (product.removed) {
    html += `
      <div style="margin-bottom:15px;">
        <strong>Removed Date:</strong> ${formatDate(product.removed)}
      </div>`;
  }
  
  if (product.report && product.report.date) {
    html += `
      <div style="margin-bottom:15px;">
        <strong>Report Date:</strong> ${formatDate(product.report.date)}
      </div>`;
  }
  
  html += `
      <div style="margin-bottom:15px;">
        <strong>Description:</strong>
        <div>${product.description || 'No description available'}</div>
      </div>
      
      <div style="margin-bottom:15px;">
        <strong>Reasons for Reporting:</strong>
        ${formatReasons(product.reasons)}
      </div>
    </div>
  `;
  
  return html;
}

// Function to report a product to the database
async function reportProduct(asin, button) {
  chrome.storage.local.get(['baseUrl'], async function(result) {
    const baseUrl = result.baseUrl || 'https://amazon-cleaner.onrender.com';
    const apiUrl = `${baseUrl}/api/product/add`;
    
    // Generate a unique request ID for this reporting
    const requestId = Math.random().toString(36).substring(2, 8);
    debugLog(`[DEBUG ${asin}] Starting report request ${requestId}`);
    
    // Change button appearance to show it's processing
    button.textContent = 'Sending...';
    button.disabled = true;
    button.style.backgroundColor = '#cccccc';
    
    // Add progress indicator for long-running requests
    let dots = 0;
    const progressInterval = setInterval(() => {
      dots = (dots + 1) % 4;
      button.textContent = 'Sending' + '.'.repeat(dots);
    }, 500);
    
    const startTime = Date.now();
    debugLog(`[DEBUG ${asin}] Reporting product to database, request ${requestId}`);
    
    try {
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          asin: asin,
          marketplaceId: 'A1PA6795UKMFR9' // German marketplace ID
        })
      });
      
      clearInterval(progressInterval);
      
      const requestDuration = Date.now() - startTime;
      debugLog(`[DEBUG ${asin}] Report request ${requestId} completed in ${requestDuration}ms with status ${response.status}`);
      
      if (!response.ok) {
        throw new Error('Server response was not OK: ' + response.status);
      }
      
      // For debugging, log the raw response
      if (isDebugMode) {
        const responseClone = response.clone();
        const rawText = await responseClone.text();
        debugLog(`[DEBUG ${asin}] Raw report response for ${requestId}:`, rawText);
      }
      
      const data = await response.json();
      debugLog(`[DEBUG ${asin}] Report response for ${requestId}:`, data);
      
      if (data.success || data.status) {
        // Check status of the response
        if (data.status === 'already_reported' || data.status === 'already_exists') {
          debugLog(`[DEBUG ${asin}] Product already exists in database for ${requestId}`);
          setButtonState(button, 'reported', data.reportDate || null);
        } else if (data.status === 'removed') {
          debugLog(`[DEBUG ${asin}] Product already removed for ${requestId}`);
          setButtonState(button, 'removed', null);
        } else {
          // If we got a 201 Created, it's a newly added product (show as staged)
          debugLog(`[DEBUG ${asin}] Product newly staged for ${requestId}`);
          setButtonState(button, 'staged', new Date().toISOString());
        }
      } else {
        debugLog(`[DEBUG ${asin}] Unknown response format for ${requestId}:`, data);
        throw new Error('Unknown response format');
      }
    } catch (error) {
      clearInterval(progressInterval);
      console.error(`[DEBUG ${asin}] Error reporting product for ${requestId}:`, error);
      
      // Show error state
      button.textContent = 'Error ✗';
      button.style.backgroundColor = '#C62828'; // Red
      button.style.color = 'white';
      
      // Reset after 3 seconds
      setTimeout(() => {
        setButtonState(button, 'unreported', null);
      }, 3000);
    }
  });
}

