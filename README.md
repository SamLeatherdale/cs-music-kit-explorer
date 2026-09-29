# CS Music Kit Explorer

CS Music Kit Explorer is a Chrome extension for comparing Counter-Strike 2 music kits. In Chrome it appears as **CS2 Music Kit Rater**.

You rate kits, mark the ones you own, and keep a record of which soundtracks you have heard. Listening stays on the [csgoskins.gg music kit category](https://csgoskins.gg/categories/music-kit). The extension does not download audio files.

## Features

- Shows every music kit from the public category pages on one board, including Normal and StatTrak prices.
- Stores a 1–5 star rating and an **Owned** toggle for each kit. Select the current star again to clear the rating.
- Filters the board by **All**, **Unrated**, **Owned**, and **Rated**. The default sort lists unrated kits, then owned kits, then rated kits from high to low.
- Adds the same rating controls to csgoskins.gg category cards and item pages, and shows the category as one list.
- Adds soundtrack controls on an item page: play or pause the last track, one volume slider for every track, listen dots, a fixed track order, and an emoji before each title.

Listen dots follow the old iTunes pattern. A full dot means unplayed, a half dot means partly played, and an empty dot means finished. The kit dot summarizes its songs.

## Your data

Ratings, owned flags, and listen progress stay in the extension's local storage on your computer. From the comparison board you can export that data as JSON and import it into another browser profile. This repository does not contain your personal ratings or listen history.

The extension reads the public csgoskins.gg category pages when you refresh the catalog. It requests the `storage` permission and host access to `https://csgoskins.gg/*`.

## Develop

Install dependencies and start the development build:

```sh
pnpm install
pnpm dev
```

Leave that dev server running. In Chrome:

1. Open `chrome://extensions`.
2. Turn on **Developer mode**.
3. Choose **Load unpacked**.
4. Select the `.output/chrome-mv3-dev` folder in this repository.

Select the vinyl toolbar icon to open the comparison board. After a code change, select **Reload** on the extension card if Chrome does not pick up the new build.

## Build

Typecheck, build, and pack the extension:

```sh
pnpm compile
pnpm build
pnpm zip
```
