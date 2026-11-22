# Ashutosh Kumar · Portfolio

**Live site → [ashutoshkumar2312004.github.io/My-Portfolio](https://ashutoshkumar2312004.github.io/My-Portfolio/)**

A cinematic, scroll-driven walk through one career: from Business Analyst to Business Development. Scroll it like a film.

## The walk

1. **College:** B.E. Electronics & Communication, PERI Institute of Technology, Chennai (2021–2025).
2. **Courses:** five courses, from code to circuits to the full web stack.
3. **Internship:** Web Development Intern, MX Omega Technologies (Jul–Sep 2024).
4. **Full-time:** Business Analyst, Shreyas Tech Solutions, B2B travel SaaS (Jul 2025–Jun 2026).
5. **FarmwiseAI:** Business Development, Geospatial AI & AgriTech (from Sep 2026); Business Development Executive from 4 Dec 2026.
6. **Contact:** email, LinkedIn and résumé.

Two looks: **Crimson & Gold** and **Emerald Fog**. The toggle relights the same moment of the walk.

## How it's built

- One continuous walk of 1,124 frames at 24 fps, stored as JPEG sprite sheets (`frames/c` and `frames/e`, 6 frames per sheet).
- Plain HTML, CSS and JavaScript in a single `index.html`, with no framework and no build step.
- Sheets are decoded around the current moment with `createImageBitmap`, drawn on a canvas, and blended between neighbouring frames so motion stays smooth at any refresh rate.
- A gliding wheel scroll, chapter navigation, and a frame-matched relight between the two looks.
- Deployed to GitHub Pages by GitHub Actions on every push to `main`.

The scenes are AI-generated (the page says so in its corner); the words and the facts are mine.

The previous version of this portfolio is kept on the [`old-portfolio`](https://github.com/AshutoshKumar2312004/My-Portfolio/tree/old-portfolio) branch.

## Contact

ashutoshkumar04022004.ak@gmail.com · [LinkedIn](https://www.linkedin.com/in/ashutosh-kumar-053428307/) · [GitHub](https://github.com/AshutoshKumar2312004)
