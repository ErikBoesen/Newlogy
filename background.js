const FORM_URL = 'https://goo.gl/forms/HxoIETyK0SeLPDVz1';

chrome.runtime.onInstalled.addListener(function(details) {
    if (details.reason == 'install') {
        // On first install, set uninstall URL if browser supports it
        if (chrome.runtime.setUninstallURL) {
            chrome.runtime.setUninstallURL(FORM_URL);
        }
    }
});
