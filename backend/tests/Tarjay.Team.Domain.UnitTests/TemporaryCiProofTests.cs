namespace Tarjay.Team.Domain.UnitTests;

// TEMPORARY, NOT FOR MERGE. LET-125 proof that the backend check reports real
// results rather than passing vacuously. This branch exists to be thrown away.
public class TemporaryCiProofTests
{
    [Fact]
    public void DeliberateFailure_ProvesTheCheckFails_Fails()
    {
        Assert.Equal(1, 2);
    }
}
