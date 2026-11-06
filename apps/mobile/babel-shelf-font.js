/** Gives every Text and TextInput the Outfit file that matches its fontWeight. */
module.exports = function shelfFontPlugin({ types: t }) {
  function fontCall(styleExpr) {
    return t.logicalExpression(
      "||",
      t.optionalCallExpression(
        t.memberExpression(t.identifier("globalThis"), t.identifier("__shelfFont")),
        [styleExpr],
        true,
      ),
      t.stringLiteral("Outfit_400Regular"),
    );
  }

  return {
    name: "shelf-font",
    visitor: {
      JSXOpeningElement(path, state) {
        // Live Activity layouts run in the widget extension, not React Native.
        if (/[\\/]src[\\/]widgets[\\/]/.test(state.filename || "")) return;
        const name = path.node.name;
        if (!t.isJSXIdentifier(name) || (name.name !== "Text" && name.name !== "TextInput")) return;
        const attr = path.node.attributes.find((item) => t.isJSXAttribute(item) && t.isJSXIdentifier(item.name) && item.name.name === "style");
        const styleExpr = attr && t.isJSXAttribute(attr) && t.isJSXExpressionContainer(attr.value) ? attr.value.expression : t.identifier("undefined");
        if (t.isJSXEmptyExpression(styleExpr)) return;
        const wrapped = t.jsxExpressionContainer(
          t.arrayExpression([
            t.objectExpression([t.objectProperty(t.identifier("fontFamily"), fontCall(styleExpr))]),
            styleExpr,
          ]),
        );
        if (attr && t.isJSXAttribute(attr)) attr.value = wrapped;
        else path.node.attributes.push(t.jsxAttribute(t.jsxIdentifier("style"), wrapped));
      },
    },
  };
};
