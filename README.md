# Newlogy

Newlogy simplifies the [Schoology](https://schoology.com) Learning Management System interface, removing seldom-used components and streamlining styling.

**Links:**
* [Chrome](https://chrome.google.com/webstore/detail/newlogy/bjcabjilfhmoahlpkffklacegnndmbbb)
* [Firefox](https://addons.mozilla.org/addon/newlogy)

If on another browser, simply sideload this extension in developer mode.

### Before
![Before screenshot](screenshots/old.png)

### After
![After screenshot](screenshots/new.png)

Please note that Newlogy was initially designed with the FCCPS version of Schoology in mind. The platform does not vary much between schools, so in theory it should work for any school. If you notice an inconsistency, please open an issue and we'll look into it.

Additionally note that the users of this extension are assumed to be students. Some elements useful only to teachers might be inhibited. This is not intentional, but as students we have no way to test this extension on the teacher interface.

## Goals
* Unify design
* Remove extraneous and redundant UI elements
* Simplify design language

## Changes
* Replace school logo with a simple "Home" link because we haven't even used Access since fourth grade
* Remove useless homepage "RECENT ACTIVITY" and "COURSE DASHBOARD" tabs
* Display course and group menus as a list, not as a clunky grid
* Remove course "academic year" label because you know what year it is
* Use normal capitalization for header tabs to match the rest of the interface and because the word "grades" is already frightening enough in lowercase
* Disable school-colored links, which are used unevenly and clash with the traditional blue color scheme
* Use fewer shades of grey for text
* Style buttons in a similar way
* Replace bizarre smiley faces next to like buttons with thumbs up emoji
* Automatically load posts as you scroll
* Add flag emoji next to language selection, because reasons
* Remove logged-in user's name from header because you probably don't need to be reminded who you are
* Several hundred other graphical tweaks

## License
[MIT](LICENSE)
## Author
Developed by [Erik Boesen](https://github.com/ErikBoesen) at George Mason High School.
