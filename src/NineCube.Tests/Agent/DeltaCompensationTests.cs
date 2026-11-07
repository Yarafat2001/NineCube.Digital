using System;
using System.Collections.Generic;
using FluentAssertions;
using NineCube.Application.Abstractions;
using NineCube.Application.Contracts;
using NineCube.Application.Services.Agent;
using Xunit;

namespace NineCube.Tests.Agent;

public sealed class DeltaCompensationTests
{
    private sealed class MutableClock : IClock
    {
        public DateTime UtcNow { get; } = new(2026, 11, 7, 22, 0, 0, DateTimeKind.Utc);
    }

    [Fact]
    public void Delta_verification_confirms_exact_quantity_increase_and_version_progression()
    {
        var clock = new MutableClock();
        var reconciliation = new CartReconciliationService(null!, clock);

        var preSnapshot = new CartSnapshot(
            CustomerId: 1,
            Version: 3,
            Subtotal: 50000m,
            Lines: new List<CartLineSnapshot>
            {
                new(ProductId: 101, Sku: "LAPTOP-01", Name: "Laptop A", UnitPrice: 50000m, Currency: "BDT", Quantity: 1, AvailableStock: 5)
            },
            TimestampUtc: clock.UtcNow);

        // Agent added 1 more unit of product 101
        var postSnapshot = new CartSnapshot(
            CustomerId: 1,
            Version: 4,
            Subtotal: 100000m,
            Lines: new List<CartLineSnapshot>
            {
                new(ProductId: 101, Sku: "LAPTOP-01", Name: "Laptop A", UnitPrice: 50000m, Currency: "BDT", Quantity: 2, AvailableStock: 5)
            },
            TimestampUtc: clock.UtcNow);

        var delta = new CommerceOperationDelta(ProductId: 101, Sku: "LAPTOP-01", QuantityDelta: 1, ExpectedPrice: 50000m);

        var isValid = reconciliation.VerifyDelta(preSnapshot, postSnapshot, delta);
        isValid.Should().BeTrue("expected post quantity is 1 + 1 = 2 and version progressed from 3 to 4");
    }

    [Fact]
    public void Delta_verification_rejects_concurrency_drift_or_version_regression()
    {
        var clock = new MutableClock();
        var reconciliation = new CartReconciliationService(null!, clock);

        var preSnapshot = new CartSnapshot(
            CustomerId: 1,
            Version: 3,
            Subtotal: 50000m,
            Lines: new List<CartLineSnapshot>
            {
                new(ProductId: 101, Sku: "LAPTOP-01", Name: "Laptop A", UnitPrice: 50000m, Currency: "BDT", Quantity: 1, AvailableStock: 5)
            },
            TimestampUtc: clock.UtcNow);

        // Stale snapshot with identical version
        var postSnapshotSameVersion = preSnapshot with
        {
            Lines = new List<CartLineSnapshot>
            {
                new(ProductId: 101, Sku: "LAPTOP-01", Name: "Laptop A", UnitPrice: 50000m, Currency: "BDT", Quantity: 2, AvailableStock: 5)
            }
        };

        var delta = new CommerceOperationDelta(ProductId: 101, Sku: "LAPTOP-01", QuantityDelta: 1, ExpectedPrice: 50000m);

        var isValid = reconciliation.VerifyDelta(preSnapshot, postSnapshotSameVersion, delta);
        isValid.Should().BeFalse("concurrency violation: version did not increment");
    }

    [Fact]
    public async Task Delta_compensation_record_isolates_transaction_delta()
    {
        var clock = new MutableClock();
        var reconciliation = new CartReconciliationService(null!, clock);
        var delta = new CommerceOperationDelta(ProductId: 202, Sku: "PHONE-01", QuantityDelta: 2, ExpectedPrice: 35000m);

        var record = await reconciliation.RecordForwardMutationAsync("tx_100", 5, delta, initialCartVersion: 1);

        record.Should().NotBeNull();
        record.TransactionId.Should().Be("tx_100");
        record.OperationId.Should().NotBeNullOrWhiteSpace();
        record.ProductId.Should().Be(202);
        record.DeltaQuantity.Should().Be(2);
        record.UnitPrice.Should().Be(35000m);
        record.InitialCartVersion.Should().Be(1);
    }
}
