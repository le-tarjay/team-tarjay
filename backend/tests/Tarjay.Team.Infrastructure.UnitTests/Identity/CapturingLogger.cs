using System;
using System.Collections.Generic;
using System.Linq;
using Microsoft.Extensions.Logging;

namespace Tarjay.Team.Infrastructure.UnitTests.Identity;

/// <summary>
/// An <see cref="ILogger{T}"/> that keeps everything written to it, so a test can assert on what
/// was logged — and, more to the point here, on what was not.
/// </summary>
internal sealed class CapturingLogger<T> : ILogger<T>
{
    private readonly List<string> _lines = [];

    /// <summary>Every line logged, at every level, including any exception's own message.</summary>
    public IReadOnlyList<string> Lines => _lines;

    /// <summary>True if any logged line contains the given text.</summary>
    public bool ContainsText(string text) =>
        _lines.Any(line => line.Contains(text, StringComparison.Ordinal));

    public IDisposable BeginScope<TState>(TState state)
        where TState : notnull => NullScope.Instance;

    // Every level is enabled so that a test asserting "this never appears at any level" is
    // actually given the chance to see it.
    public bool IsEnabled(LogLevel logLevel) => true;

    public void Log<TState>(
        LogLevel logLevel,
        EventId eventId,
        TState state,
        Exception? exception,
        Func<TState, Exception?, string> formatter)
    {
        ArgumentNullException.ThrowIfNull(formatter);

        var line = formatter(state, exception);

        if (exception is not null)
        {
            line = $"{line} {exception}";
        }

        // The structured values are captured too, not just the formatted message: a PIN passed as
        // a template argument would otherwise be invisible to an assertion that only reads the
        // rendered string.
        if (state is IEnumerable<KeyValuePair<string, object?>> values)
        {
            line = $"{line} {string.Join(" ", values.Select(value => $"{value.Key}={value.Value}"))}";
        }

        _lines.Add($"{logLevel}: {line}");
    }

    private sealed class NullScope : IDisposable
    {
        public static readonly NullScope Instance = new();

        public void Dispose()
        {
        }
    }
}
