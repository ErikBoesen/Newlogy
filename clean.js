var nav = document.querySelector('nav[role="navigation"] ul');
nav.removeChild(nav.childNodes[0]);
var item = document.querySelector('nav[role="navigation"] ul li:nth-of-type(3)');
var new_item = item.cloneNode(true);
new_item.childNodes[0].href = '/';
new_item.childNodes[0].textContent = 'HOME';
nav.prepend(new_item);
