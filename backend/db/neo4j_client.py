from __future__ import annotations

import os

from neo4j import GraphDatabase

_driver = None


def get_driver():
    global _driver
    if _driver is None:
        # macOS python.org builds don't see system CAs — point TLS at certifi's bundle
        try:
            import certifi

            os.environ.setdefault("SSL_CERT_FILE", certifi.where())
        except ImportError:
            pass
        _driver = GraphDatabase.driver(
            os.getenv("NEO4J_URI"),
            auth=(os.getenv("NEO4J_USERNAME"), os.getenv("NEO4J_PASSWORD")),
        )
    return _driver


def run_query(query: str, params: dict | None = None):
    driver = get_driver()
    with driver.session() as session:
        result = session.run(query, params or {})
        return [record.data() for record in result]


def close_driver():
    global _driver
    if _driver:
        _driver.close()
        _driver = None
