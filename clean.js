// Replace header logo with a plain Home button
var nav = document.querySelector('nav[role="navigation"] ul');
nav.removeChild(nav.childNodes[0]);
var item = document.querySelector('nav[role="navigation"] ul li:nth-of-type(3)');
var new_item = item.cloneNode(true);
new_item.childNodes[0].href = '/';
new_item.childNodes[0].textContent = 'Home';
nav.prepend(new_item);

document.querySelector('footer nav').textContent = '// Using BetterSchoology by Erik Boesen';

// Add flag to language selector
var flags = {
    'English': '🇺🇸',
    'English (UK)': '🇬🇧',
    'Français des Affaires': '🇫🇷',
    '日本語': '🇯🇵',
    'Bahasa Melayu': '🇲🇾',
    'Português': '🇵🇹',
    'Español': '🇪🇸',
};
var lang = document.querySelector('footer button');
lang.textContent = flags[lang.textContent] + ' ' + lang.textContent;
