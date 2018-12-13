const FORM_URL = 'https://goo.gl/forms/HxoIETyK0SeLPDVz1';
const browser = window.browser || window.chrome;

browser.runtime.onInstalled.addListener(function(details) {
    // Set uninstall URL if browser supports it
    if (browser.runtime.setUninstallURL)
        browser.runtime.setUninstallURL(FORM_URL);
});

browser.webRequest.onBeforeRequest.addListener(function(frame) {
    console.log(frame.url);
    segments = frame.url.split('/');
    return { redirectUrl: browser.extension.getURL(segments[segments.length - 1]) };
},
{
    urls: [
        "https://asset-cdn.schoology.com/assets/js/module_bundle_2c5d868225502ea323036b403b4b110d.js",
    ],
    types: ["script"]
},
["blocking"]
);
