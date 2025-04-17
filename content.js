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
    // Skip if we've already added a button to this product
    if (product.querySelector('.product-collector-btn')) {
      return;
    }
    
    // Get product info
    const asin = product.getAttribute('data-asin');
    
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
    
    // Create the button
    const button = document.createElement('button');
    button.className = 'product-collector-btn';
    button.setAttribute('data-asin', cleanAsin);
    button.textContent = 'Checking...';  // Initial state while checking
    button.style.cssText = 'background-color: #cccccc; color: black; font-weight: bold; border: none; padding: 8px 12px; margin: 5px 0; border-radius: 3px; cursor: pointer; display: block; width: 100%;';
    
    // Add the button after the insertion point
    insertionPoint.parentNode.insertBefore(button, insertionPoint.nextSibling);
    console.log('Button added for ASIN: ' + asin);
    
    // Check product status in database
    checkProductStatus(cleanAsin, button);
  });
}

// Function to check product status in database
function checkProductStatus(asin, buttonElement) {
  chrome.storage.local.get(['baseUrl'], function(result) {
    const baseUrl = result.baseUrl || 'https://amazon-cleaner.onrender.com';
    const apiUrl = `${baseUrl}/api/product/${asin}`;
    
    console.log('Checking product status:', apiUrl);
    
    fetch(apiUrl)
      .then(response => {
        if (response.status === 404) {
          // Product not found in database
          setButtonState(buttonElement, 'unreported', null);
          return null;
        } else if (!response.ok) {
          throw new Error('Server response was not OK: ' + response.status);
        }
        return response.json();
      })
      .then(data => {
        if (!data) return; // 404 case, already handled
        
        console.log('Product status data:', data);
        
        if (data.success && data.status) {
          // Update button based on product status
          setButtonState(buttonElement, data.status, data.reportDate);
        } else {
          // Default to unreported if status is unclear
          setButtonState(buttonElement, 'unreported', null);
        }
      })
      .catch(error => {
        console.error('Error checking product status:', error);
        // On error, show default state with option to report
        setButtonState(buttonElement, 'unreported', null);
      });
  });
}

// Function to set button state based on product status
function setButtonState(button, status, reportDate) {
  const asin = button.getAttribute('data-asin');
  
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
      break;
      
    case 'removed':
      button.textContent = 'Removed';
      button.style.backgroundColor = '#757575'; // Gray
      button.style.color = 'white';
      button.disabled = true;
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
}

// Function to report a product to the database
function reportProduct(asin, button) {
  chrome.storage.local.get(['baseUrl'], function(result) {
    const baseUrl = result.baseUrl || 'https://amazon-cleaner.onrender.com';
    const apiUrl = `${baseUrl}/api/product/add`;
    
    // Change button appearance to show it's processing
    button.textContent = 'Sending...';
    button.disabled = true;
    button.style.backgroundColor = '#cccccc';
    
    console.log('Reporting product to database:', asin);
    
    fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        asin: asin,
        marketplaceId: 'A1PA6795UKMFR9' // German marketplace ID
      })
    })
    .then(response => {
      if (!response.ok) {
        throw new Error('Server response was not OK: ' + response.status);
      }
      return response.json();
    })
    .then(data => {
      console.log('Report response:', data);
      
      if (data.success || data.status) {
        // Check status of the response
        if (data.status === 'already_reported') {
          setButtonState(button, 'reported', data.reportDate);
        } else if (data.status === 'removed') {
          setButtonState(button, 'removed', null);
        } else {
          // If we got a 201 Created, it's a newly reported product
          setButtonState(button, 'reported', new Date().toISOString());
        }
      } else {
        throw new Error('Unknown response format');
      }
    })
    .catch(error => {
      console.error('Error reporting product:', error);
      
      // Show error state
      button.textContent = 'Error ✗';
      button.style.backgroundColor = '#C62828'; // Red
      button.style.color = 'white';
      
      // Reset after 3 seconds
      setTimeout(() => {
        setButtonState(button, 'unreported', null);
      }, 3000);
    });
  });
}

