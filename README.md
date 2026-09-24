# ShadowTrace
> An AI-powered misinformation and threat intelligence platform.

## 🔗 Live Demo

https://shadow-trace-lilac.vercel.app/

## 🎥 Demo Video

https://youtu.be/Alw_jawXaWA

## 💻 Source Code

https://github.com/Anushka-Btech/ShadowTrace

### AI-Powered Intelligence & Investigation Platform

ShadowTrace is an AI-assisted intelligence and investigation platform designed to correlate signals across digital content, accounts, networks, campaigns, images, messaging data, and temporal activity.

It combines a modern Next.js mission-control interface with a FastAPI intelligence backend, specialized AI agents, and a Neo4j graph layer to transform fragmented signals into structured investigative insights.

---

## Overview

Modern digital investigations often involve information scattered across multiple sources:

- Social and digital activity
- Account relationships
- Coordinated campaigns
- Suspicious content
- Images and possible synthetic media
- Messaging activity
- Linguistic patterns
- Temporal relationships
- Network connections

ShadowTrace brings these signals together into a unified investigation workspace.

The platform uses specialized AI agents and graph-based relationship analysis to help investigators explore connections, identify patterns, examine suspicious activity, and organize findings.

> **Note:** ShadowTrace is an analytical decision-support system. AI-generated findings should be independently verified before being treated as factual conclusions.

---

## Core Capabilities

### Mission Control

A centralized operational dashboard providing:

- Live intelligence
- Active investigations
- AI findings
- Network intelligence
- Investigation status
- Threat environment
- Activity timelines

### Account Intelligence

Analyze accounts and associated signals to surface:

- Account-level intelligence
- Behavioral indicators
- Connected entities
- Investigation context
- Network relationships

### Network Graph

Neo4j-powered graph analysis for exploring relationships between:

- Accounts
- Campaigns
- Posts
- Coordinated activity
- Shared signals
- Interactions

### AI Agent System

ShadowTrace uses specialized backend agents for different analytical tasks, including:

- Content analysis
- Threat classification
- Campaign detection
- Network mapping
- Temporal coordination
- Linguistic fingerprinting
- AI-generated image detection
- Deepfake analysis
- WhatsApp analysis
- Language identification
- AI operation detection
- Fact-checking ingestion
- Bluesky ingestion

### Image Forensics

Provides image-focused analysis and AI-generated/synthetic media detection workflows.

### WhatsApp Analysis

Provides analysis workflows for WhatsApp-related investigative signals.

### Campaign Analysis

Identifies and analyzes patterns that may indicate coordinated activity across multiple signals.

### Alerts

Provides an investigation-oriented view of notable intelligence and detected activity.

### Reports

Provides a structured space for reviewing investigation results and intelligence findings.

---

## Architecture

```text
                         ┌─────────────────────────┐
                         │       User / Analyst    │
                         └────────────┬────────────┘
                                      │
                                      ▼
                         ┌─────────────────────────┐
                         │   Next.js Frontend      │
                         │   Mission Control UI    │
                         │   React + TypeScript    │
                         └────────────┬────────────┘
                                      │
                                      ▼
                         ┌─────────────────────────┐
                         │     FastAPI Backend     │
                         │     Python API Layer    │
                         └────────────┬────────────┘
                                      │
                    ┌─────────────────┼─────────────────┐
                    │                 │                 │
                    ▼                 ▼                 ▼
             ┌─────────────┐   ┌─────────────┐   ┌──────────────┐
             │ AI Agents   │   │ Neo4j AuraDB│   │ External AI  │
             │ LangGraph   │   │ Graph Layer │   │ / Data APIs  │
             └─────────────┘   └─────────────┘   └──────────────┘
                    │
        ┌───────────┼────────────────────────────────┐
        │           │           │          │          │
        ▼           ▼           ▼          ▼          ▼
     Content     Threat      Campaign   Network    Temporal
     Analysis    Analysis    Detection  Mapping   Coordination
        │           │           │          │          │
        └───────────┴───────────┴──────────┴──────────┘
                              │
                              ▼
                    ┌─────────────────────┐
                    │ Investigation       │
                    │ Intelligence        │
                    │ Findings            │
                    └─────────────────────┘