# V1DaemonsGet200ResponseDaemonsInnerTrigger


## Properties

Name | Type | Description | Notes
------------ | ------------- | ------------- | -------------
**type** | **str** |  | 
**events** | **List[str]** |  | 
**secret** | **str** |  | [optional] 
**cron** | **str** |  | 
**condition** | **str** |  | 
**interval_ms** | **int** |  | [optional] [default to 60000]

## Example

```python
from paws_client.models.v1_daemons_get200_response_daemons_inner_trigger import V1DaemonsGet200ResponseDaemonsInnerTrigger

# TODO update the JSON string below
json = "{}"
# create an instance of V1DaemonsGet200ResponseDaemonsInnerTrigger from a JSON string
v1_daemons_get200_response_daemons_inner_trigger_instance = V1DaemonsGet200ResponseDaemonsInnerTrigger.from_json(json)
# print the JSON string representation of the object
print(V1DaemonsGet200ResponseDaemonsInnerTrigger.to_json())

# convert the object into a dict
v1_daemons_get200_response_daemons_inner_trigger_dict = v1_daemons_get200_response_daemons_inner_trigger_instance.to_dict()
# create an instance of V1DaemonsGet200ResponseDaemonsInnerTrigger from a dict
v1_daemons_get200_response_daemons_inner_trigger_from_dict = V1DaemonsGet200ResponseDaemonsInnerTrigger.from_dict(v1_daemons_get200_response_daemons_inner_trigger_dict)
```
[[Back to Model list]](../README.md#documentation-for-models) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to README]](../README.md)


