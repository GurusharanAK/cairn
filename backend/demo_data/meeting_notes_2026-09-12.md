# Team meeting - 12 Sep 2026

Attendees: Arjun Rao, Meera Iyer, Nikhil Shah

Decision: Use PostgreSQL for primary storage. Reason: orders and payments need relational transactions; MongoDB was rejected because it could not give us multi-row transactions. Decided by: Meera Iyer.

Decision: Cap payment retries at 3. Decided by: Arjun Rao.

Task: Reporting export for dashboard - status: in progress

Contact: Priya Nair - payment gateway vendor liaison (reach her through the vendor support portal).
