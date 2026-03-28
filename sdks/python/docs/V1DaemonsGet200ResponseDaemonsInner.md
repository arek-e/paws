# V1DaemonsGet200ResponseDaemonsInner

## Properties

| Name            | Type                                                                                            | Description | Notes |
| --------------- | ----------------------------------------------------------------------------------------------- | ----------- | ----- |
| **role**        | **str**                                                                                         |             |
| **description** | **str**                                                                                         |             |
| **status**      | **str**                                                                                         |             |
| **trigger**     | [**V1DaemonsGet200ResponseDaemonsInnerTrigger**](V1DaemonsGet200ResponseDaemonsInnerTrigger.md) |             |
| **stats**       | [**V1DaemonsGet200ResponseDaemonsInnerStats**](V1DaemonsGet200ResponseDaemonsInnerStats.md)     |             |

## Example

```python
from paws_client.models.v1_daemons_get200_response_daemons_inner import V1DaemonsGet200ResponseDaemonsInner

# TODO update the JSON string below
json = "{}"
# create an instance of V1DaemonsGet200ResponseDaemonsInner from a JSON string
v1_daemons_get200_response_daemons_inner_instance = V1DaemonsGet200ResponseDaemonsInner.from_json(json)
# print the JSON string representation of the object
print(V1DaemonsGet200ResponseDaemonsInner.to_json())

# convert the object into a dict
v1_daemons_get200_response_daemons_inner_dict = v1_daemons_get200_response_daemons_inner_instance.to_dict()
# create an instance of V1DaemonsGet200ResponseDaemonsInner from a dict
v1_daemons_get200_response_daemons_inner_from_dict = V1DaemonsGet200ResponseDaemonsInner.from_dict(v1_daemons_get200_response_daemons_inner_dict)
```

[[Back to Model list]](../README.md#documentation-for-models) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to README]](../README.md)
