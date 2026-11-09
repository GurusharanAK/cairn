# Orbit Pay - Architecture Overview

Orbit Pay is a small checkout platform built by the student team for the Campus Commerce pilot.

Component: Authentication (aliases: Auth API, auth service, login service) - owner: Arjun Rao. Issues and validates session tokens for every other service.
Component: Payment retry (aliases: payment retries, retry logic, retry limit) - owner: Arjun Rao. Retries failed card charges against the payment gateway. Depends on: Authentication.
Component: Dashboard (aliases: admin dashboard, reporting dashboard) - owner: Meera Iyer. Shows orders and revenue to campus staff. Depends on: Database.
Component: Database (aliases: PostgreSQL, Postgres, primary storage) - owner: Meera Iyer. Stores orders, users and payment attempts.

Only Arjun Rao knows how the Authentication service is configured for each environment, including the signing-key setup.
