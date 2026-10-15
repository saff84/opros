require("./register.cjs");
const { test } = require("node:test");
const assert = require("node:assert/strict");
const React = require("react");
const Editor = require("../app/results/editor.tsx").default;
const { legacySurvey } = require("../app/survey-model.ts");
test("Editor immediately removes a question, reports unsaved deletion and restores it without losing subsequent edits", () => {
  const originalHook = React.useState;
  const states = [];
  let cursor = 0;
  React.useState = (initial) => {
    const index = cursor++;
    if (!(index in states))
      states[index] = typeof initial === "function" ? initial() : initial;
    return [
      states[index],
      (value) => {
        states[index] =
          typeof value === "function" ? value(states[index]) : value;
      },
    ];
  };
  const initial = {
    ...legacySurvey,
    questions: legacySurvey.questions.slice(0, 3),
  };
  const render = () => {
    cursor = 0;
    return Editor({ initial, onSave: async () => {}, onCancel: () => {} });
  };
  function nodes(node) {
    if (!node || typeof node !== "object") return [];
    if (Array.isArray(node)) return node.flatMap(nodes);
    return [node, ...nodes(node.props?.children)];
  }
  function text(node) {
    if (typeof node === "string" || typeof node === "number")
      return String(node);
    if (Array.isArray(node)) return node.map(text).join("");
    return node && typeof node === "object" ? text(node.props?.children) : "";
  }
  const cards = (tree) =>
    nodes(tree).filter(
      (n) => n.props?.className === "summary-card question-editor",
    );
  try {
    let tree = render();
    assert.equal(cards(tree).length, 3);
    nodes(tree)
      .find((n) => n.props?.["aria-label"]?.startsWith("Удалить вопрос 1:"))
      .props.onClick();
    tree = render();
    assert.equal(cards(tree).length, 2);
    assert.deepEqual(
      states[0].questions.map((q) => q.id),
      initial.questions.slice(1).map((q) => q.id),
    );
    assert.match(text(tree), /удалён из редактора/);
    assert.match(text(tree), /Есть несохранённые изменения/);
    assert.match(text(tree), /Осталось: 2/);
    nodes(tree)
      .find(
        (n) =>
          n.type === "input" && n.props.value === initial.questions[1].title,
      )
      .props.onChange({ target: { value: "Изменён после удаления" } });
    tree = render();
    nodes(tree)
      .find((n) => n.type === "button" && text(n) === "Вернуть вопрос")
      .props.onClick();
    tree = render();
    assert.equal(cards(tree).length, 3);
    assert.equal(states[0].questions[0].id, initial.questions[0].id);
    assert.equal(states[0].questions[1].title, "Изменён после удаления");
    assert.doesNotMatch(text(tree), /удалён из редактора/);
    // The last remaining question cannot be deleted.
    for (let count = 3; count > 1; count--) {
      nodes(tree)
        .find((n) => n.props?.["aria-label"]?.startsWith("Удалить вопрос 1:"))
        .props.onClick();
      tree = render();
    }
    const lastDelete = nodes(tree).find((n) =>
      n.props?.["aria-label"]?.startsWith("Удалить вопрос 1:"),
    );
    assert.equal(lastDelete.props.disabled, true);
    lastDelete.props.onClick();
    assert.equal(cards(render()).length, 1);
  } finally {
    React.useState = originalHook;
  }
});
