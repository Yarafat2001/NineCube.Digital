"""Compact SKU identity checks; no database or network required."""
import unittest
from common import sku


class CompactSkuTests(unittest.TestCase):
    def test_readable_and_bounded(self):
        value = sku('apple-iphone-12-128gb-blue')
        self.assertTrue(value.startswith('BD-APPL-IPHO-12-'))
        self.assertLessEqual(len(value), 24)
        self.assertRegex(value, r'^BD-[A-Z0-9-]+-[A-F0-9]{6}$')

    def test_configuration_changes_have_different_codes(self):
        first = 'lenovo-ideapad-slim-3-16gb-512gb'
        second = 'lenovo-ideapad-slim-3-32gb-1tb'
        self.assertEqual(sku(first), sku(first))
        self.assertNotEqual(sku(first), sku(second))

    def test_generic_prefix_does_not_hide_product_identity(self):
        self.assertTrue(sku('generic-laptop-8-gb-ram-256-gb-ssd').startswith('BD-LAPT-8-GB-'))


if __name__ == '__main__':
    unittest.main()
