const sleepInSecs = (secs: number) =>
  new Promise(resolve => setTimeout(resolve, secs * 1000));

const openFileGlancer = async (page: IJupyterLabPageFixture) => {
  // open jupyter lab
  await page.goto("http://localhost:8888/lab", { waitUntil: "domcontentloaded" });
  await page.waitForSelector('.jp-FileBrowser');
  // click on Fileglancer icon
  await page.getByText('Fileglancer', { exact: true }).click();
};

export { sleepInSecs, openFileGlancer };
