// Replace header logo with a plain Home button
var home_button = document.querySelector('._2JX1Q._1LY8n._2SVA_._9GDcm');
home_button.href = '/';
home_button.className = '_1SIMq _2kpZl _3OAXJ _13cCs _3_bfp _2M5aC _24avl _3v0y7 _2s0LQ _3ghFm _3LeCL _31GLY _9GDcm _1D8fw util-height-six-3PHnk util-line-height-six-3lFgd util-text-decoration-none-1n0lI Header-header-button-active-state-3AvBm Header-header-button-1EE8Y sExtlink-processed';
home_button.style = '';
home_button.childNodes[0].className = '';

// Simulate linking for full notification item
var notification_selector = 'div._2awxe._3skcp._1tpub._26UWf._2nSV0'
onclick = function(e) {
    // Check if user clicked on notification item or anything inside of one
    if (e.target.matches(notification_selector + ',' + notification_selector + ' *')) {
        // Go up the chain to find the actual notification div
        var target = e.target;
        while (!target.matches(notification_selector)) {
            target = target.parentNode;
        }

        window.location.href = target.getElementsByTagName('a')[0].href;
    }
}

const browser = window.browser || window.chrome;
browser.storage.sync.get(['autoload', 'floating_header', 'custom_css', 'enter_posts_comment'], function(items) {
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

    if (items.custom_css) {
        var style = document.createElement('style');
        style.innerHTML = items.custom_css;
        document.head.appendChild(style);
    }

    if (items.enter_posts_comment) {
        onkeypress = function(e) {
            if (e.keyCode === 13 && !e.shiftKey && e.target.name === 'comment') {
                e.preventDefault();
                console.log('Posting comment!');
                e.target.parentNode.parentNode.nextSibling.childNodes[0].click();
            }
        };
    }
});

// Footer options link
document.querySelector('footer nav').innerHTML = '// <a target="_blank" href="' + browser.extension.getURL('options/options.html') + '">Newlogy Options 🔧</a>';

if (window.location.pathname == '/' || window.location.pathname == '/home') {
    var brag = document.createElement('div');
    brag.id = 'brag';
    brag.textContent = 'I did get in. Thank you all for your support and for using a Chrome extension that some nerd cooked up in his spare time. I am honored to go to a school full of such wise and thoughtful individuals. :)\n\n- Erik';
    document.getElementById('right-column').appendChild(brag);
}

// Add flag to language selector
var flags = {'en': '🇺🇸', 'en-GB': '🇬🇧', 'fr-corp': '🇫🇷', 'ja': '🇯🇵', 'ms': '🇲🇾', 'pt': '🇵🇹', 'es': '🇪🇸'};
var lang = document.querySelector('footer button');
lang.textContent = flags[document.documentElement.lang] + ' ' + lang.textContent;
