# Amazon Product Link Collector

A Chrome extension that adds a "Collect" button next to products on Amazon.de search results. When clicked, the product URL is sent to a configurable server.

## Features

- Automatically adds "Collect" buttons to Amazon.de search results
- Configurable server URL for forwarding collected links
- Visual feedback when sending links (success/failure indicators)

## Installation

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable "Developer mode" by toggling the switch in the top-right corner
3. Click "Load unpacked" and select this directory
4. The extension should now appear in your extensions list

## Usage

1. Click the extension icon in the Chrome toolbar
2. Enter your server URL in the popup and click "Save"
3. Navigate to Amazon.de and search for products
4. Click the "Collect" button next to any product to send its URL to your server

## Technical Details

- The server endpoint should accept POST requests with JSON payload
- The JSON format includes: `{ url, source, timestamp }`
- Amazon's DOM structure may change over time, requiring selectors to be updated

## Development

To make changes:
1. Modify the code as needed
2. Reload the extension from the Chrome extensions page
3. Test your changes

## Note

You'll need to provide your own icons in the images directory:
- icon16.png (16x16)
- icon48.png (48x48)
- icon128.png (128x128)