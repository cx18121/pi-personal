// This is the minimum runtime verified by the setup tests, not the dev dependency pin.
const minimum = [0, 99, 0];
const input = process.argv[2] ?? "";
const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(input.trim());
const parts = match?.slice(1).map(Number);
const comparison = parts?.map((value, index) => Math.sign(value - minimum[index])).find((value) => value !== 0) ?? 0;
if (!parts || comparison < 0) {
  console.error(`Pi ${minimum.join(".")} or newer is required; found ${input || "no version"}.`);
  process.exitCode = 1;
} else {
  console.log(`Pi ${input.trim()} meets the minimum runtime requirement.`);
}
