# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

这是一个 Claude Code Skill 项目，包含一个名为 `product-spec-builder` 的技能，用于帮助用户生成可直接用于 Google AI Studio Builder 的产品规格文档（Product Spec）。

## 项目结构

```
.claude/
  skills/
    product-spec-builder/
      SKILL.md              # 技能定义和角色设定
      reference.md          # Google AI Studio 能力清单
      templates/
        product-spec-template.md  # Product Spec 输出模板
  settings.local.json       # 本地权限配置
```

## 技能使用

调用技能时会扮演"废才"这个产品经理角色，通过直白的追问帮助用户理清产品需求，最终输出结构化的 Product Spec 文档。

输出文档命名规范：`<产品名称>-Product-Spec.md`

## 核心原则

- AI 优先原则：所有功能首先考虑用 AI 实现
- 匹配 Google AI Studio 能力时参考 `reference.md`
- 生成文档时使用 `templates/product-spec-template.md` 模板格式