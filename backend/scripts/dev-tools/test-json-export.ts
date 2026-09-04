async function testJsonExport() {
  const res = await fetch('http://127.0.0.1:3001/api/runs/0f376348-ba00-4c04-99a6-f09c35a4967d');
  const data = await res.json();

  console.log('=== AUDIT EXPORT JSON TEST ===');
  console.log('Run ID:', data.run_id);
  console.log('Summary:', data.summary);
  console.log('Timing:', data.timing);
  console.log('Passes:', data.passes);
  console.log('Matches Count:', data.matches?.length);
  console.log('Exceptions Count:', data.exceptions?.length);
  console.log('Sample Match:', data.matches[0]);
  console.log('Sample Exception:', data.exceptions[0]);
}

testJsonExport().catch(console.error);
