all: zip

clean:
	rm archive.zip
zip:
	zip -r archive manifest.json *.html *.css *.js icons options css
publish:
	webstore publish --extension-id bjcabjilfhmoahlpkffklacegnndmbbb
