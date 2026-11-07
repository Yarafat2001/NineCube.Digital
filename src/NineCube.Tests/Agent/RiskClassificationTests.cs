using FluentAssertions;
using NineCube.Application.Services.Agent;
using Xunit;

namespace NineCube.Tests.Agent;

public sealed class RiskClassificationTests
{
    private readonly RiskClassificationService _classifier = new();

    [Theory]
    [InlineData("search_products")]
    [InlineData("filter_catalog")]
    [InlineData("compare_specs")]
    [InlineData("compare_products")]
    [InlineData("track_order")]
    [InlineData("get_policy")]
    [InlineData("estimate_delivery")]
    public void Read_only_intents_are_classified_as_tier_1(string intent)
    {
        var tier = _classifier.Classify(intent);
        tier.Should().Be(1);
        _classifier.IsMutation(intent).Should().BeFalse();
        _classifier.IsHighImpact(intent).Should().BeFalse();
    }

    [Theory]
    [InlineData("add_to_cart")]
    [InlineData("update_cart_quantity")]
    [InlineData("remove_from_cart")]
    [InlineData("apply_coupon")]
    [InlineData("clear_preferences")]
    public void Reversible_mutations_are_classified_as_tier_2(string intent)
    {
        var tier = _classifier.Classify(intent);
        tier.Should().Be(2);
        _classifier.IsMutation(intent).Should().BeTrue();
        _classifier.IsHighImpact(intent).Should().BeFalse();
    }

    [Theory]
    [InlineData("prepare_checkout")]
    [InlineData("authorize_payment")]
    [InlineData("capture_payment")]
    [InlineData("modify_security")]
    [InlineData("delete_address")]
    [InlineData("change_password")]
    [InlineData("cancel_order")]
    public void Sensitive_and_financial_operations_are_classified_as_tier_3(string intent)
    {
        var tier = _classifier.Classify(intent);
        tier.Should().Be(3);
        _classifier.IsMutation(intent).Should().BeTrue();
        _classifier.IsHighImpact(intent).Should().BeTrue();
    }

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData("transfer_money")]
    [InlineData("override_security")]
    [InlineData("drop_database")]
    [InlineData("arbitrary_unknown_intent")]
    public void Unrecognized_or_malicious_intents_fail_closed_to_tier_3(string intent)
    {
        var tier = _classifier.Classify(intent);
        tier.Should().Be(3);
        _classifier.IsHighImpact(intent).Should().BeTrue();
    }
}
