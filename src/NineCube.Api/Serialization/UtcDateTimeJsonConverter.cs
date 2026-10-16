using System.Globalization;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace NineCube.Api.Serialization;

/// <summary>
/// Writes every <see cref="DateTime"/> as an unambiguous UTC instant,
/// e.g. <c>2026-10-13T19:51:50.848Z</c>.
///
/// The whole application works in UTC (<c>IClock.UtcNow</c>), but EF Core materialises
/// <c>datetime2</c> columns as <see cref="DateTimeKind.Unspecified"/>, so the default serialiser
/// emitted values like <c>2026-10-13T19:51:50.848</c> with no offset. A browser reads that as
/// *local* time, which silently shifts every timestamp by the client's UTC offset - the staff
/// console in Asia/Dhaka showed an order placed at 01:51 as the previous day at 19:51. Suffixing
/// the UTC instant is what lets the client convert to the viewer's own time zone correctly.
/// </summary>
public sealed class UtcDateTimeJsonConverter : JsonConverter<DateTime>
{
    private const string Format = "yyyy-MM-dd'T'HH:mm:ss.fff'Z'";

    public override DateTime Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
        => reader.GetDateTime();

    public override void Write(Utf8JsonWriter writer, DateTime value, JsonSerializerOptions options)
    {
        var utc = value.Kind switch
        {
            DateTimeKind.Utc => value,
            DateTimeKind.Local => value.ToUniversalTime(),
            // Unspecified means it came out of the database; the application only ever writes UTC.
            _ => DateTime.SpecifyKind(value, DateTimeKind.Utc)
        };

        writer.WriteStringValue(utc.ToString(Format, CultureInfo.InvariantCulture));
    }
}
