# Project: OpenControl SDK

## Vision

Build an open-source TypeScript SDK called **OpenControl**.

The goal of OpenControl is to make **any web application** support mobile phones as programmable controllers.

This is **not** a game engine.

This is **not** a runtime.

This is **not** an AirConsole clone.

It is an SDK that handles:

* mobile controllers
* controller rendering
* device capabilities
* networking abstraction
* session management
* bidirectional communication

Developers should focus only on building their game or application.

---

# Design Principles

The SDK should be:

* TypeScript first
* React friendly
* Framework agnostic internally where possible
* Modular internally
* Single npm package externally
* Easy to extend
* Extremely easy to use
* AI-friendly
* Well documented
* Fully typed

Expose only:

```ts
@opencontrol/sdk
```

Internally feel free to organize the project into multiple folders/modules.

---

# Philosophy

Developers should never think about:

* WebRTC
* PeerJS
* sockets
* reconnection
* player IDs
* room management

They should only think about:

* players
* controller events
* controller profiles
* device capabilities

---

# Primary API

The host application should look something like:

```ts
const session = await OpenControl.host({
    controller: "classic"
});
```

or

```ts
const session = await OpenControl.host({
    controller: MyCustomController
});
```

The SDK should also support joining from a mobile device.

---

# Core Concepts

The SDK consists of five pillars.

## 1. Sessions

Responsible for:

* creating a host
* joining a host
* player management
* room management
* reconnection
* disconnect handling
* lifecycle

The game should never implement these.

---

## 2. Controller Profiles

The SDK should ship with several built-in controller profiles.

Examples:

### Classic

* D-Pad
* A
* B
* X
* Y
* Start
* Select

Perfect for:

* platformers
* fighting games
* puzzle games

---

### Arcade

* Joystick
* Action buttons
* Triggers

Perfect for:

* racing
* shooters

---

### Touch

* Buttons
* Grid
* Touchpad
* Swipe

Perfect for:

* board games
* quiz games
* card games

---

### Sensor

Minimal UI.

Instead expose device capabilities such as:

* accelerometer
* gyroscope
* orientation
* shake
* vibration

---

These profiles should evolve independently from games.

---

# Important

Games should never depend on the UI of a controller.

Games depend only on the profile's event contract.

The controller UI is an implementation detail.

---

# Event Contracts

Every controller profile defines a strongly typed event contract.

Example:

Classic

```ts
move

buttonDown

buttonUp

start

select
```

Racing

```ts
steering

accelerate

brake

nitro
```

Sensor

```ts
orientation

gyro

shake
```

Games subscribe to these events.

The actual UI can change in future versions without breaking games.

---

# Controller Evolution

Controllers must be versionable.

Example:

Classic v1

Classic v2

Classic v3

As long as the event contract remains compatible, games should continue working.

---

# Custom Controllers

The SDK should support custom React controllers.

Example:

```tsx
<OpenControlProvider>

    <Joystick id="move" />

    <Button id="jump" />

    <Button id="attack" />

</OpenControlProvider>
```

The SDK should provide reusable components such as:

* Button
* DPad
* Joystick
* Touchpad
* Slider
* Trigger
* Grid

The networking should be completely abstracted away.

Developers should only build UI.

---

# Device Capabilities

Provide a unified API for device capabilities where browser support exists.

Examples:

* vibration
* gyroscope
* accelerometer
* orientation
* multi-touch
* camera (permission based)
* microphone (permission based)
* geolocation (permission based)
* clipboard (where available)

The SDK should gracefully detect unsupported capabilities.

---

# Bidirectional Communication

The SDK should support:

Controller → Host

and

Host → Controller

Examples:

Host can:

* vibrate controller
* flash screen
* show toast
* change controller theme
* enable/disable controls
* update controller state

---

# Networking

Networking should be abstracted behind an interface.

The SDK should not be tied to any provider.

Design an adapter architecture.

Examples of future adapters:

* PeerJS
* Native WebRTC
* WebSocket
* Cloudflare Worker

The SDK should consume a networking adapter.

Do not tightly couple networking to the SDK.

---

# Architecture

Keep the architecture clean.

Suggested internal modules:

* session
* controller
* profiles
* networking
* events
* sensors
* feedback
* permissions
* react
* ui
* utilities

These are implementation details.

Externally expose a single package.

---

# Documentation

Document every public API.

Include examples.

Explain the philosophy behind the architecture.

---

# Testing

Provide unit tests for:

* sessions
* events
* controller profiles
* networking abstraction
* permissions
* device capability detection

---

# Example Applications

Include examples for:

1. Classic controller
2. Racing controller
3. Sensor controller
4. Custom React controller
5. Host receiving events

---

# Non Goals

Do NOT build:

* authentication
* cloud saves
* achievements
* marketplace
* game engine
* game runtime
* rendering engine
* game launcher

This project is only an SDK.

---

# Deliverables

Build the project incrementally.

1. Folder structure
2. Type definitions
3. Networking abstraction
4. Session management
5. Event system
6. Built-in controller profiles
7. React controller components
8. Device APIs
9. Example applications
10. Tests
11. Documentation

Focus on clean architecture, long-term maintainability, extensibility, and an excellent developer experience.
