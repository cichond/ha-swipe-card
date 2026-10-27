import { readFileSync } from "node:fs";
import resolve from "@rollup/plugin-node-resolve";
import typescript from "@rollup/plugin-typescript";
import replace from "@rollup/plugin-replace";
import terser from "@rollup/plugin-terser";

const { version } = JSON.parse(readFileSync("package.json", "utf8"));

// Swiper's stylesheet goes into the card's shadow root, so import it as text.
const cssAsString = () => ({
  name: "css-as-string",
  transform(code, id) {
    if (id.endsWith(".css")) {
      return { code: `export default ${JSON.stringify(code)};`, map: null };
    }
    return null;
  },
});

export default {
  input: "src/ha-swipe-card.ts",
  output: {
    file: "dist/ha-swipe-card.js",
    format: "es",
    inlineDynamicImports: true,
  },
  plugins: [
    replace({
      preventAssignment: true,
      values: { __VERSION__: JSON.stringify(version) },
    }),
    resolve(),
    cssAsString(),
    typescript({ include: ["src/**/*.ts"], exclude: ["test/**"] }),
    terser({ format: { comments: false } }),
  ],
};
