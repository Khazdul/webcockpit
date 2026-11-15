// Vite's ?raw imports of the fixtures (the worker tests run through Vite).
declare module '*?raw' {
  const text: string;
  export default text;
}
