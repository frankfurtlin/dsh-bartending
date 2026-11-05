/**
 * dsh-bartending —— client 半（浏览器）。
 *
 * 手写 ModuleLoader 工厂，不经打包：只依赖宿主已提供的 react，用 h() 直接构造元素。
 * 做两件事：
 *   1. 在侧栏「更多」菜单（sidebar.panellist.actions）注册一行「调酒」，
 *      点它调用 layout.selectPanel 打开主面板 —— 不进侧栏常驻行。
 *   2. 在 main 座位注册 keyed 面板页：同源 iframe 指向宿主托管的 /bartending/，
 *      工具条提供 返回对话 / 刷新 / 新窗口打开。
 */
window.__ModuleLoader__.load({
  id: "dsh-bartending",
  factory: function (require) {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

    var react = require("react");
    var h = react.createElement;

    /** 面板 id —— main 座位的 key，也是「更多」菜单行的锚点。 */
    var PANEL_ID = "bartending";
    /** 宿主托管的静态站地址（带尾斜杠，应用内部全用相对路径）。 */
    var APP_URL = "/bartending/";
    /** 「更多」菜单里的排序：排在插件类入口之后。 */
    var MORE_ORDER = 40;

    /** 宿主 UI 基础组件；某些版本可能不向第三方插件导出，缺失时退回原生按钮。 */
    var primitives = null;
    try {
      primitives = require("@deepseek-ai/dsh-client-ui-primitives");
    } catch (error) {
      primitives = null;
    }

    /** 调酒图标：宿主图标库里没有酒杯，用内联 SVG（currentColor 跟随主题）。 */
    function CocktailIcon(props) {
      var size = (props && props.size) || 16;
      return h(
        "svg",
        {
          viewBox: "0 0 24 24",
          width: size,
          height: size,
          fill: "none",
          stroke: "currentColor",
          strokeWidth: 1.7,
          strokeLinecap: "round",
          strokeLinejoin: "round",
          "aria-hidden": "true",
          focusable: "false",
        },
        h("path", { d: "M4 4h16l-8 10z" }),
        h("path", { d: "M12 14v5.5" }),
        h("path", { d: "M8.5 19.5h7" }),
      );
    }

    var COLORS = {
      border: "color-mix(in srgb, currentColor 18%, transparent)",
      muted: "color-mix(in srgb, currentColor 58%, transparent)",
      chip: "color-mix(in srgb, currentColor 8%, transparent)",
    };

    function ToolbarButton(props) {
      var base = {
        appearance: "none",
        border: "1px solid " + COLORS.border,
        background: props.primary ? "color-mix(in srgb, currentColor 14%, transparent)" : "transparent",
        color: "inherit",
        font: "inherit",
        fontSize: 12,
        lineHeight: "20px",
        padding: "3px 10px",
        borderRadius: 7,
        cursor: "pointer",
      };
      return h(
        "button",
        {
          type: "button",
          onClick: props.onClick,
          title: props.title,
          "data-dsh-bartending-action": props.action,
          style: base,
        },
        props.children,
      );
    }

    /** 主面板页：工具条 + 同源 iframe。 */
    function BartendingPanelPage(props) {
      var injected = props || {};
      var frameRef = react.useRef(null);

      var reload = function () {
        var frame = frameRef.current;
        // 直接改 DOM src：只重载 iframe，不重挂整个面板组件。
        if (frame) frame.src = APP_URL + "?t=" + Date.now();
      };
      var backToConversation = function () {
        try {
          if (injected.selectConversation) injected.selectConversation();
        } catch (error) {
          console.warn("[dsh-bartending] 返回对话失败:", error);
        }
      };

      return h(
        "div",
        {
          "data-dsh-bartending-panel": "",
          style: { display: "flex", flexDirection: "column", height: "100%", minHeight: 0 },
        },
        h(
          "div",
          {
            style: {
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "8px 14px",
              borderBottom: "1px solid " + COLORS.border,
              flexShrink: 0,
            },
          },
          h("span", { style: { fontSize: 14, fontWeight: 600 } }, "调酒"),
          h(
            "span",
            { style: { fontSize: 12, color: COLORS.muted } },
            "Tipsy · 一杯一杯地调",
          ),
          h("span", { style: { flex: 1 } }),
          h(
            ToolbarButton,
            { action: "back", onClick: backToConversation, title: "回到对话" },
            "返回对话",
          ),
          h(ToolbarButton, { action: "reload", onClick: reload, title: "重新加载调酒应用" }, "刷新"),
          h(
            "a",
            {
              "data-dsh-bartending-action": "open",
              href: APP_URL,
              target: "_blank",
              rel: "noreferrer",
              style: { fontSize: 12, color: COLORS.muted, textDecoration: "none" },
            },
            "新窗口打开",
          ),
        ),
        h("iframe", {
          ref: frameRef,
          src: APP_URL,
          title: "调酒",
          "data-dsh-bartending-frame": "",
          style: { flex: 1, minHeight: 0, width: "100%", border: 0, background: "transparent" },
        }),
      );
    }

    /** 「更多」菜单里的一行；有宿主基础组件时用 MenuItemButton，保持原生菜单观感。 */
    function BartendingMenuItem(props) {
      var injected = props || {};
      var onSelect = function () {
        if (typeof props.onDismiss === "function") {
          try {
            props.onDismiss();
          } catch (error) {
            console.warn("[dsh-bartending] 关闭「更多」菜单失败:", error);
          }
        }
        if (typeof injected.open === "function") injected.open();
      };
      if (primitives && primitives.MenuItemButton) {
        return h(primitives.MenuItemButton, { onSelect: onSelect, icon: h(CocktailIcon, { size: 16 }) }, "调酒");
      }
      return h(
        "button",
        {
          type: "button",
          onClick: onSelect,
          "data-dsh-bartending-more": "",
          style: {
            display: "flex",
            alignItems: "center",
            gap: 8,
            width: "100%",
            padding: "7px 12px",
            border: 0,
            borderRadius: 6,
            background: "transparent",
            color: "inherit",
            font: "inherit",
            fontSize: 13,
            textAlign: "left",
            cursor: "pointer",
          },
        },
        h(CocktailIcon, { size: 16 }),
        h("span", null, "调酒"),
      );
    }

    var inject = ["slots", "layout"];

    function apply(ctx) {
      var disposers = [];

      var openPanel = function () {
        try {
          ctx.layout.selectPanel(PANEL_ID);
        } catch (error) {
          console.warn("[dsh-bartending] 打开面板失败:", error);
        }
      };
      var selectConversation = function () {
        try {
          ctx.layout.selectPanel(null);
        } catch (error) {
          console.warn("[dsh-bartending] 返回对话失败:", error);
        }
      };

      try {
        var slots = ctx.slots;
        disposers.push(
          slots.inject("main", function () {
            return slots.register(
              {
                name: "main",
                key: PANEL_ID,
                inject: function () {
                  return { selectConversation: selectConversation };
                },
              },
              BartendingPanelPage,
            );
          }),
        );
        disposers.push(
          slots.inject("sidebar.panellist.actions", function () {
            return slots.register(
              {
                name: "sidebar.panellist.actions",
                id: "dsh-bartending-more",
                order: MORE_ORDER,
                inject: function () {
                  return { open: openPanel };
                },
              },
              BartendingMenuItem,
            );
          }),
        );
      } catch (error) {
        console.warn("[dsh-bartending] panel registration failed:", error);
      }

      ctx.effect(function () {
        return function () {
          for (var i = 0; i < disposers.length; i += 1) {
            try {
              disposers[i]();
            } catch {}
          }
          disposers.length = 0;
        };
      }, "dsh-bartending: ui mounts");
    }

    exports.apply = apply;
    exports.inject = inject;
    return module.exports;
  },
});
