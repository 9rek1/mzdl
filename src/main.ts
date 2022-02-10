import puppeteer from 'puppeteer';
import path from 'path';
import fs from 'fs';

const userAgent =
  'Mozilla/5.0 (Windows NT 10.0; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/80.0.3987.132 Safari/537.36';

const urls = [''];

(async () => {
  const browser = await puppeteer.launch({
    headless: false,
    slowMo: 50,
    defaultViewport: null,
    args: ['--start-maximized'],
  });

  const context = await browser.createIncognitoBrowserContext();
  const detailPage = await context.newPage();
  await detailPage.setUserAgent(userAgent);

  for (const url of urls) {
    await detailPage.goto(url);
    await detailPage.waitForTimeout(1000);

    const bookTitle = convertToValidName(
      await detailPage.$eval('.bookgreen', el => (el as HTMLElement).innerText)
    );

    const bookDir = path.join(__dirname, `../books/${bookTitle}`);
    if (!fs.existsSync(bookDir)) fs.mkdirSync(bookDir);

    await downloadBook(-1, 0, bookDir);
    await detailPage.waitForTimeout(500);
  }

  await browser.close();

  async function downloadBook(
    pageCount: number,
    timeoutCount: number,
    bookDir: string
  ) {
    // 「閲覧」ボタンを押せば新しいページでビュアーが開く
    await detailPage.click('.viewbtn');
    await detailPage.waitForTimeout(3000);

    const viewerPage = (await browser.pages())[2];
    await viewerPage.setUserAgent(userAgent);

    // レスポンスを監視し、各ページを保存する
    viewerPage.on('response', async res => {
      const url = res.url();
      if (url.includes('GetImg.jpg')) {
        pageCount += 2;
        await viewerPage.waitForTimeout(500);
        fs.writeFile(
          path.join(bookDir, `${pageCount}.jpg`),
          await res.buffer(),
          err => {
            if (err) console.log(err);
          }
        );
        await viewerPage.waitForTimeout(500);
      }
    });

    // ページを見開き表示にする
    await viewerPage.click('.doublebt');
    await viewerPage.waitForTimeout(3000);

    // タイムアウト後に再開するときは、次に落とすページまでジャンプ
    if (timeoutCount > 0) {
      // 1回のタイムアウトで4p分余計に進んでしまう
      pageCount -= timeoutCount * 4;
      await viewerPage.$eval('.w42.pagenumedit.browseedit', el => {
        (el as HTMLInputElement).value = pageCount.toString();
      });
      await viewerPage.click('.movebt');
      await viewerPage.waitForTimeout(2000);
    }

    // ダイアログが出たら、アクセプトしてビュアーを閉じる
    // タイムアウト時と「閲覧終了」ボタンを押した際にダイアログが出る
    viewerPage.on('dialog', async dialog => {
      await viewerPage.waitForTimeout(500);
      await dialog.accept();
    });

    // 最後までページをめくる
    // ただしタイムアウトする場合がある
    const totalPages = await viewerPage.$eval('.allpageno', el =>
      parseInt(el.innerHTML, 10)
    );
    while (pageCount < totalPages) {
      try {
        await viewerPage.click('.nextbt');
        await viewerPage.waitForTimeout(2000);
      } catch (err) {
        if (err instanceof Error) console.log(err.message);
        break;
      }
    }

    // タイムアウトした場合はそこから再開
    // 終わった場合は「閲覧終了」ボタンを押す
    if (pageCount < totalPages) {
      await downloadBook(pageCount, timeoutCount + 1, bookDir);
    } else {
      await viewerPage.click('#abortview');
    }
  }
})();

function convertToValidName(s: string) {
  return s
    .replace(/\//g, '／')
    .replace(/\?/g, '？')
    .replace(/</g, '＜')
    .replace(/>/g, '＞')
    .replace(/¥/g, '￥')
    .replace(/\\/g, '￥')
    .replace(/\*/g, '＊')
    .replace(/\|/g, '｜')
    .replace(/"/g, '”')
    .replace(/:/g, '：');
}
