using System;
using System.Collections.Generic;
using System.Linq;
using System.Reflection;
using System.Reflection.Emit;

namespace Tarjay.Team.Domain.UnitTests.Schedule;

/// <summary>
/// Every type a compiled type refers to: through its signatures, and through the IL of its
/// method bodies.
/// </summary>
/// <remarks>
/// Signatures alone would miss the dependency that matters most here, which is a method that
/// quietly news up or calls into another module without that module ever showing up in a field
/// or parameter. So the IL is walked too, and every method, field, and type token is resolved. A
/// <c>const</c> is inlined by the compiler and leaves no reference, and nothing here relies on
/// finding one.
/// </remarks>
internal static class TypeReferences
{
    private const BindingFlags DeclaredMembers =
        BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Instance | BindingFlags.Static |
        BindingFlags.DeclaredOnly;

    private static readonly Dictionary<short, OpCode> s_opCodes = typeof(OpCodes)
        .GetFields(BindingFlags.Public | BindingFlags.Static)
        .Select(field => (OpCode)field.GetValue(null)!)
        .ToDictionary(opCode => opCode.Value);

    /// <summary>The types <paramref name="type"/> refers to, generic arguments unpacked.</summary>
    /// <param name="type">The type to inspect.</param>
    /// <returns>Every referenced type, each once.</returns>
    public static IReadOnlySet<Type> Of(Type type)
    {
        var found = new HashSet<Type>();

        Add(found, type.BaseType);

        foreach (Type implemented in type.GetInterfaces())
        {
            Add(found, implemented);
        }

        foreach (FieldInfo field in type.GetFields(DeclaredMembers))
        {
            Add(found, field.FieldType);
        }

        foreach (PropertyInfo property in type.GetProperties(DeclaredMembers))
        {
            Add(found, property.PropertyType);
        }

        IEnumerable<MethodBase> methods = type.GetConstructors(DeclaredMembers)
            .Cast<MethodBase>()
            .Concat(type.GetMethods(DeclaredMembers));

        foreach (MethodBase method in methods)
        {
            foreach (ParameterInfo parameter in method.GetParameters())
            {
                Add(found, parameter.ParameterType);
            }

            if (method is MethodInfo withReturn)
            {
                Add(found, withReturn.ReturnType);
            }

            AddFromBody(found, method);
        }

        return found;
    }

    private static void AddFromBody(HashSet<Type> found, MethodBase method)
    {
        MethodBody? body = method.GetMethodBody();

        if (body is null)
        {
            return;
        }

        foreach (LocalVariableInfo local in body.LocalVariables)
        {
            Add(found, local.LocalType);
        }

        byte[] il = body.GetILAsByteArray() ?? [];
        Type[]? typeArguments = method.DeclaringType is { IsGenericType: true } declaring
            ? declaring.GetGenericArguments()
            : null;
        Type[]? methodArguments = method is MethodInfo { IsGenericMethod: true } generic
            ? generic.GetGenericArguments()
            : null;

        int position = 0;

        while (position < il.Length)
        {
            OpCode opCode;

            if (il[position] == 0xFE)
            {
                opCode = s_opCodes[unchecked((short)(0xFE00 | il[position + 1]))];
                position += 2;
            }
            else
            {
                opCode = s_opCodes[il[position]];
                position += 1;
            }

            switch (opCode.OperandType)
            {
                case OperandType.InlineNone:
                    break;
                case OperandType.ShortInlineBrTarget:
                case OperandType.ShortInlineI:
                case OperandType.ShortInlineVar:
                    position += 1;
                    break;
                case OperandType.InlineVar:
                    position += 2;
                    break;
                case OperandType.InlineI8:
                case OperandType.InlineR:
                    position += 8;
                    break;
                case OperandType.InlineSwitch:
                    position += 4 + (4 * BitConverter.ToInt32(il, position));
                    break;
                case OperandType.InlineMethod:
                case OperandType.InlineField:
                case OperandType.InlineType:
                case OperandType.InlineTok:
                    AddMember(found, method.Module.ResolveMember(BitConverter.ToInt32(il, position), typeArguments, methodArguments));
                    position += 4;
                    break;
                default:
                    // InlineI, InlineBrTarget, InlineString, InlineSig, ShortInlineR.
                    position += 4;
                    break;
            }
        }
    }

    private static void AddMember(HashSet<Type> found, MemberInfo? member)
    {
        switch (member)
        {
            case Type type:
                Add(found, type);
                break;
            case FieldInfo field:
                Add(found, field.DeclaringType);
                Add(found, field.FieldType);
                break;
            case MethodBase method:
                Add(found, method.DeclaringType);

                foreach (ParameterInfo parameter in method.GetParameters())
                {
                    Add(found, parameter.ParameterType);
                }

                if (method is MethodInfo withReturn)
                {
                    Add(found, withReturn.ReturnType);
                }

                break;
        }
    }

    private static void Add(HashSet<Type> found, Type? type)
    {
        if (type is null || !found.Add(type))
        {
            return;
        }

        if (type.HasElementType)
        {
            Add(found, type.GetElementType());
        }

        if (type.IsGenericType)
        {
            foreach (Type argument in type.GetGenericArguments())
            {
                Add(found, argument);
            }
        }
    }
}
