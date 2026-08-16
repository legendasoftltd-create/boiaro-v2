// §14 Mixer voice chain: a simple per-sample envelope-follower noise gate.
// Below thresholdDb, output ramps toward silence (release); above it, output
// ramps toward full pass-through (attack) — smoothed to avoid audible
// clicks rather than a hard on/off cut.
class NoiseGateProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: "thresholdDb", defaultValue: -50, minValue: -80, maxValue: 0 },
      { name: "attack", defaultValue: 0.005, minValue: 0.0001, maxValue: 1 },
      { name: "release", defaultValue: 0.15, minValue: 0.001, maxValue: 2 },
    ];
  }

  constructor() {
    super();
    this.envelope = 0;
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    const output = outputs[0];
    if (!input || input.length === 0) return true;

    const thresholdDb = parameters.thresholdDb[0];
    const thresholdLin = Math.pow(10, thresholdDb / 20);
    const attackCoeff = Math.exp(-1 / (sampleRate * Math.max(parameters.attack[0], 0.0001)));
    const releaseCoeff = Math.exp(-1 / (sampleRate * Math.max(parameters.release[0], 0.001)));

    for (let ch = 0; ch < input.length; ch++) {
      const inCh = input[ch];
      const outCh = output[ch];
      for (let i = 0; i < inCh.length; i++) {
        const sample = inCh[i];
        const targetGain = Math.abs(sample) >= thresholdLin ? 1 : 0;
        const coeff = targetGain > this.envelope ? attackCoeff : releaseCoeff;
        this.envelope = targetGain + coeff * (this.envelope - targetGain);
        outCh[i] = sample * this.envelope;
      }
    }
    return true;
  }
}

registerProcessor("noise-gate-processor", NoiseGateProcessor);
