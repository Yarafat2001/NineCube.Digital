"""Preflight safety and rollback integration checks against the selected SQL Server."""
import copy
import json
import unittest
from common import CLEAN, categories, sku, sql
from load import validate_records, batch_sql, snapshot

class PipelineTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.products = json.loads((CLEAN / "products.json").read_text(encoding="utf-8"))
        cls.tree = categories()
        cls.tags = json.loads((CLEAN / "allowed-tags.json").read_text(encoding="utf-8"))

    def test_missing_primary_refused(self):
        rows = copy.deepcopy(self.products)
        rows[0]["primaryCategorySlug"] = "missing-category"
        with self.assertRaisesRegex(ValueError, "missing or not a leaf"):
            validate_records(rows, self.tree, self.tags)

    def test_nonleaf_primary_refused(self):
        rows = copy.deepcopy(self.products)
        rows[0]["primaryCategorySlug"] = "home"
        with self.assertRaisesRegex(ValueError, "missing or not a leaf"):
            validate_records(rows, self.tree, self.tags)

    def test_duplicate_identity_refused(self):
        rows = copy.deepcopy(self.products)
        duplicate = copy.deepcopy(rows[0])
        duplicate["slug"] += "-duplicate"
        duplicate["sku"] = sku(duplicate["slug"])
        rows.append(duplicate)
        with self.assertRaisesRegex(ValueError, "Duplicate normalized"):
            validate_records(rows, self.tree, self.tags)

    def test_unknown_tags_refused(self):
        rows = copy.deepcopy(self.products)
        rows[0]["tags"].append("Unapproved tag")
        with self.assertRaisesRegex(ValueError, "Unknown/invalid tag"):
            validate_records(rows, self.tree, self.tags)

    def test_late_failure_rolls_back_entire_category_batch(self):
        before = snapshot()
        probe = copy.deepcopy(self.products[0])
        probe["slug"] = "pipeline-rollback-probe-test-only"
        probe["sku"] = sku(probe["slug"])
        probe["name"] = "Pipeline rollback probe (test only)"
        probe["tags"] = ["Brand: Rollback test only", "Budget"]
        batch = batch_sql([probe])
        statement = batch.replace("COMMIT;", "THROW 51099, 'Intentional rollback probe', 1;\nCOMMIT;")
        with self.assertRaisesRegex(RuntimeError, "Intentional rollback probe"):
            sql(statement, batch.parameters)
        self.assertEqual(before, snapshot())

if __name__ == "__main__":
    unittest.main(verbosity=2)
