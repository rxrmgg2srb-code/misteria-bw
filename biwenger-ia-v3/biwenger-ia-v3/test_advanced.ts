async function testScoring() {
  const scores = [1, 2, 3, 4, 5];
  for (const s of scores) {
    const res = await fetch(`https://cf.biwenger.com/api/v2/competitions/la-liga/data?lang=es&score=${s}`);
    const data = await res.json();
    const isco: any = Object.values(data.data.players).find((p: any) => p.name.includes('Isco'));
    if (!isco) continue;
    const played = (isco.playedHome || 0) + (isco.playedAway || 0);
    console.log(`Score=${s}: Pts=${isco.points}, Played=${played}, Avg=${played > 0 ? isco.points / played : 0}`);
  }
}

async function testNews() {
  const url = 'https://news.google.com/rss/search?q=Isco+Betis+when:7d&hl=es-ES&gl=ES&ceid=ES:es';
  const res = await fetch(url);
  const text = await res.text();
  console.log("News length:", text.length);
  const itemRegex = /<title>(.*?)<\/title>/gi;
  let match;
  let count = 0;
  while ((match = itemRegex.exec(text)) !== null && count < 5) {
    console.log("Title:", match[1]);
    count++;
  }
}

testScoring().then(() => testNews());
