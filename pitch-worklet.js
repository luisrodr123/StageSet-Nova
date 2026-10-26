class StageSetPitchShifter extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [{ name: "semitones", defaultValue: 0, minValue: -12, maxValue: 12, automationRate: "k-rate" }];
  }

  constructor(options) {
    super();
    this.delaySpan = Math.max(512, Math.round(sampleRate * 0.08));
    this.minimumDelay = 128;
    let size = 1;
    while (size < this.minimumDelay + this.delaySpan + 128) size <<= 1;
    this.mask = size - 1;
    this.writeIndex = 0;
    this.phase = 0;
    const channelCount = Math.max(1, Math.min(32, options.processorOptions?.channelCount ?? 2));
    this.buffers = Array.from({ length: channelCount }, () => new Float32Array(size));
    this.port.onmessage = (event) => {
      if (event.data?.type === "reset") {
        this.buffers.forEach((buffer) => buffer.fill(0));
        this.phase = 0;
        this.writeIndex = 0;
      }
    };
  }

  read(buffer, delay) {
    const position = (this.writeIndex - delay + buffer.length) % buffer.length;
    const lower = Math.floor(position);
    const fraction = position - lower;
    const next = (lower + 1) & this.mask;
    return buffer[lower] * (1 - fraction) + buffer[next] * fraction;
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0] ?? [];
    const output = outputs[0] ?? [];
    if (!output.length) return true;
    const frames = output[0].length;
    const semitones = parameters.semitones;

    for (let frame = 0; frame < frames; frame++) {
      const shift = semitones.length === 1 ? semitones[0] : semitones[frame];
      const ratio = 2 ** (shift / 12);
      const phaseStep = (ratio - 1) / this.delaySpan;
      const phaseA = this.phase;
      const phaseB = (phaseA + 0.5) % 1;
      const delayA = this.minimumDelay + (1 - phaseA) * this.delaySpan;
      const delayB = this.minimumDelay + (1 - phaseB) * this.delaySpan;
      const gainA = 1 - Math.abs(2 * phaseA - 1);
      const gainB = 1 - Math.abs(2 * phaseB - 1);

      for (let channel = 0; channel < output.length; channel++) {
        const source = input[Math.min(channel, input.length - 1)];
        const sample = source ? source[frame] ?? 0 : 0;
        const buffer = this.buffers[channel] ?? this.buffers[0];
        buffer[this.writeIndex] = sample;
        if (Math.abs(shift) < 0.01) output[channel][frame] = sample;
        else output[channel][frame] = this.read(buffer, delayA) * gainA + this.read(buffer, delayB) * gainB;
      }

      this.writeIndex = (this.writeIndex + 1) & this.mask;
      this.phase = (this.phase + phaseStep + 1) % 1;
    }
    return true;
  }
}

registerProcessor("stageset-pitch-shifter", StageSetPitchShifter);
