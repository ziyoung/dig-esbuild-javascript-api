## esbuild JavaScript API 原理探究

使用 Go/Rust 实现的前端打包工具层出不穷。这些工具虽然其他语言开发的，但是可以在 JavaScript 中无缝使用。它们是基于什么原理做到跨语言调用的呢？本文以 esbuild JavaScript API 为研究对象，探讨其背后的原理。

#### 测试

```bash
# 构建
yarn && yarn run build

# 执行测试
node dist/main.js
```

构建结果：

```
=== transformed ts file ===

var __defProp = Object.defineProperty;
var __markAsModule = (target) => __defProp(target, "__esModule", { value: true });
var __export = (target, all) => {
  __markAsModule(target);
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
__export(exports, {
  default: () => test,
  run: () => run
});
const id = 123;
function test() {
  console.log("test function");
}
function run() {
  console.log("run");
  console.log(`id is ${id}`);
}

=== transformed json file === 

module.exports = {
  name: "dig-esbuild-interop",
  version: "0.0.0",
  scripts: {
    build: "tsc",
    test: "node dist/main.js",
    prettier: "prettier --write '**/*.{js,jsx,tsx,ts,less,md,json}'"
  },
  devDependencies: {
    "@types/node": "^17.0.10",
    prettier: "^2.5.1",
    typescript: "^4.3.2",
    vite: "^2.4.4"
  }
};
```

#### 通信协议

查看协议格式。

```bash
# 请求包体
hexdump -C fixture/request

# 响应包体
hexdump -C fixture/response
```
