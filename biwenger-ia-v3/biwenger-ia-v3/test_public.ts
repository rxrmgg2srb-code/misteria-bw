async function test() {
  try {
    const res = await fetch("https://cf.biwenger.com/api/v2/competitions/la-liga/data?lang=es&score=5");
    const data = await res.json();
    const militao = Object.values(data.data.players).find((p: any) => p.name.includes('Milit'));
    console.log("Militao raw data:", JSON.stringify(militao, null, 2));
  } catch (e) {
    console.error(e);
  }
}
test();
