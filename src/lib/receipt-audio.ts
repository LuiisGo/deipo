// Temporary, quiet mechanical printer texture. User activation only; no autoplay.
let activeContext: AudioContext | null = null;
export async function stopPrinterSound() {
  try { await activeContext?.close(); } catch { /* Audio is optional. */ }
  activeContext = null;
}
export async function playPrinterSound() {
  try {
    await stopPrinterSound();
    const context = new AudioContext(); activeContext = context;
    await context.resume();
    const duration = 2.4;
    const buffer = context.createBuffer(1, context.sampleRate * duration, context.sampleRate);
    const samples = buffer.getChannelData(0);
    for (let i = 0; i < samples.length; i++) {
      const time = i / context.sampleRate;
      const envelope = Math.min(time * 18, 1) * Math.max(0, Math.min((duration - time) * 9, 1));
      samples[i] = (Math.random() * 2 - 1) * (Math.sin(time * 60) > 0 ? 0.04 : 0.008) * envelope;
    }
    const source = context.createBufferSource(); source.buffer = buffer;
    const filter = context.createBiquadFilter(); filter.type = 'bandpass'; filter.frequency.value = 950;
    source.connect(filter); filter.connect(context.destination); source.start();
    source.onended = () => { if (activeContext === context) void stopPrinterSound(); };
  } catch { /* Muted devices and autoplay policies must not affect the receipt. */ }
}
