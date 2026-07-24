type WebkitAudioWindow = Window & {
  webkitAudioContext?: typeof AudioContext;
};

export function createAudioContext(): AudioContext {
  const Constructor =
    window.AudioContext || (window as WebkitAudioWindow).webkitAudioContext;
  if (!Constructor) {
    throw new Error("AudioContext nao suportado");
  }
  return new Constructor();
}
