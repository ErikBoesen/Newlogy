// Replace header logo with a plain Home button
var home_button = document.querySelector('._2JX1Q._1LY8n._2SVA_._9GDcm');
home_button.href = '/';
home_button.className = '_1SIMq _2kpZl _3OAXJ _13cCs _3_bfp _2M5aC _24avl _3v0y7 _2s0LQ _3ghFm _3LeCL _31GLY _9GDcm _1D8fw util-height-six-3PHnk util-line-height-six-3lFgd util-text-decoration-none-1n0lI Header-header-button-active-state-3AvBm Header-header-button-1EE8Y sExtlink-processed';
home_button.style = '';
home_button.childNodes[0].className = '';

const browser = window.browser || window.chrome;
// TODO: Load options at start
browser.storage.sync.get(['autoload', 'floating_header', 'custom_css'], function(items) {
    console.log('Newlogy options loaded:');
    console.log(items);
    if (items.floating_header) {
        document.body.classList.add('option-floating_header');
    }
    if (items.autoload || items.autoload == undefined) {
        // Automatically load more posts when scrolled to bottom of a feed page
        window.onscroll = function() {
            if (2 * window.innerHeight + window.scrollY >= document.body.offsetHeight) {
                try {
                    // Simulate clicking "More" button
                    document.querySelector('.sEdgeMore-processed').click();
                } catch (e) {
                    console.log('No "Load More" button found.');
                }
            }
        };
    }
    var style = document.createElement('style');
    style.innerHTML = items.custom_css;
    document.head.appendChild(style);
});

// Footer options link
document.querySelector('footer nav').innerHTML = '// <a href="' + browser.extension.getURL('options/options.html') + '">Newlogy Options ⚙️</a>';


// Add flag to language selector
var flags = {'en': '🇺🇸', 'en-GB': '🇬🇧', 'fr-corp': '🇫🇷', 'ja': '🇯🇵', 'ms': '🇲🇾', 'pt': '🇵🇹', 'es': '🇪🇸'};
var lang = document.querySelector('footer button');
lang.textContent = flags[document.documentElement.lang] + ' ' + lang.textContent;
