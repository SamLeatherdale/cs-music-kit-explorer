# CS Music Kit Explorer

<img src="public/icon/128.png" width="128" height="128" alt="Shiny black vinyl record with an orange center label">

CS Music Kit Explorer is a Chrome extension for comparing Counter-Strike 2 music kits.

You rate kits, mark the ones you own, and keep a record of which soundtracks you have heard. Listening stays on the [csgoskins.gg music kit category](https://csgoskins.gg/categories/music-kit). The extension does not download audio files.

## Features

- Shows every music kit from the public category pages on one board, including Normal and StatTrak prices.
- Stores a rating from 0.5 to 5 in half-star steps, and a collection status of **Owned**, **Wishlisted**, or **Sold**. Select the current score again to clear it. A half star uses the color of the next whole star, so 0.5 is red and 4.5 is green.
- Filters the board by **All**, **Unrated**, **Owned**, and **Rated**. The default sort splits the board into Unrated, Rated, Wishlisted, Owned, and Sold. A kit with a collection status stays in that section, including when it also has a rating.
- Adds the same rating controls to csgoskins.gg category cards and item pages, and shows the category as one list.
- Adds soundtrack controls on an item page: play or pause the last track, one volume slider for every track, listen dots, a fixed track order, and an emoji before each title.

Listen dots follow the old iTunes pattern. A full dot means unplayed, a half dot means partly played, and an empty dot means finished. The kit dot summarizes its songs.

## Your data

Ratings, collection status, and listen progress sync through Chrome Sync when you are signed in. The downloaded catalogue of kit names and prices stays on this computer, because it can be fetched again from the site. From the comparison board you can export that data as JSON and import it into another browser profile. This repository does not contain your personal ratings or listen history.

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
