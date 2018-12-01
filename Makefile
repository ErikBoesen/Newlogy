all: zip

zip:
	zip -r archive manifest.json *.html *.css *.js icons options

publish:
	webstore publish --extension-id bjcabjilfhmoahlpkffklacegnndmbbb
